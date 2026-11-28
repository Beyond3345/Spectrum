//! The tile cache: rendered tiles bounded by their pixel bytes (128 MB by default, landmine #5).
//! Over budget, it drops tiles the view can't use first (another document, scale or page colour,
//! oldest first), then the pages furthest from the one being read. Evicted values are handed back
//! so the view can free their GPU textures too.

use crate::colour::PageColour;
use crate::engine::DocId;
use std::collections::HashMap;

/// The tile budget in bytes.
pub const DEFAULT_BUDGET: usize = 128 << 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TileKey {
    pub doc: DocId,
    /// 0-based page.
    pub page: u32,
    /// Pixels per point × 1000 (the scale bucket).
    pub scale: u32,
    pub colour: PageColour,
    /// Column and row in the page's tile grid.
    pub tile: (u32, u32),
}

/// What the view shows now: tiles of this document, scale and colour near this page stay longest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Focus {
    pub doc: DocId,
    pub page: u32,
    pub scale: u32,
    pub colour: PageColour,
}

struct Entry<T> {
    value: T,
    bytes: usize,
    used: u64,
}

pub struct TileCache<T> {
    budget: usize,
    bytes: usize,
    peak: usize,
    clock: u64,
    entries: HashMap<TileKey, Entry<T>>,
}

impl<T> TileCache<T> {
    pub fn new(budget: usize) -> Self {
        Self {
            budget,
            bytes: 0,
            peak: 0,
            clock: 0,
            entries: HashMap::new(),
        }
    }

    /// Bytes held now.
    pub fn bytes(&self) -> usize {
        self.bytes
    }

    /// The most bytes ever held at once.
    pub fn peak(&self) -> usize {
        self.peak
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn contains(&self, key: &TileKey) -> bool {
        self.entries.contains_key(key)
    }

    /// The tile, marked as just used.
    pub fn get(&mut self, key: &TileKey) -> Option<&T> {
        self.clock += 1;
        let entry = self.entries.get_mut(key)?;
        entry.used = self.clock;
        Some(&entry.value)
    }

    /// Every tile held for `page` of `doc`, in any scale or colour.
    pub fn page_tiles(&self, doc: DocId, page: u32) -> impl Iterator<Item = (&TileKey, &T)> {
        self.entries
            .iter()
            .filter(move |(k, _)| k.doc == doc && k.page == page)
            .map(|(k, e)| (k, &e.value))
    }

    /// Adds a tile, then evicts until the cache is within budget (never the tile just added).
    /// Returns what was evicted, replaced value included.
    pub fn insert(&mut self, key: TileKey, value: T, bytes: usize, focus: Focus) -> Vec<T> {
        self.clock += 1;
        let mut evicted = Vec::new();
        if let Some(old) = self.entries.insert(
            key,
            Entry {
                value,
                bytes,
                used: self.clock,
            },
        ) {
            self.bytes -= old.bytes;
            evicted.push(old.value);
        }
        self.bytes += bytes;
        while self.bytes > self.budget {
            let victim = self
                .entries
                .iter()
                .filter(|(k, _)| **k != key)
                .max_by_key(|(k, e)| {
                    let other =
                        k.doc != focus.doc || k.scale != focus.scale || k.colour != focus.colour;
                    (other, k.page.abs_diff(focus.page), u64::MAX - e.used)
                })
                .map(|(k, _)| *k);
            let Some(victim) = victim else { break };
            if let Some(entry) = self.entries.remove(&victim) {
                self.bytes -= entry.bytes;
                evicted.push(entry.value);
            }
        }
        self.peak = self.peak.max(self.bytes);
        evicted
    }

    /// Drops every tile `keep` says no to.
    pub fn retain(&mut self, mut keep: impl FnMut(&TileKey) -> bool) -> Vec<T> {
        let gone: Vec<TileKey> = self.entries.keys().filter(|k| !keep(k)).copied().collect();
        gone.into_iter()
            .filter_map(|k| self.entries.remove(&k))
            .map(|e| {
                self.bytes -= e.bytes;
                e.value
            })
            .collect()
    }

    /// Drops everything (the panel is hidden).
    pub fn clear(&mut self) -> Vec<T> {
        self.bytes = 0;
        self.entries.drain().map(|(_, e)| e.value).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MB: usize = 1 << 20;

    fn key(doc: u64, page: u32, scale: u32) -> TileKey {
        TileKey {
            doc: DocId::test(doc),
            page,
            scale,
            colour: PageColour::White,
            tile: (0, 0),
        }
    }

    fn focus(page: u32) -> Focus {
        Focus {
            doc: DocId::test(1),
            page,
            scale: 2000,
            colour: PageColour::White,
        }
    }

    #[test]
    fn evicts_furthest_pages_to_stay_in_budget() {
        let mut cache = TileCache::new(40 * MB);
        for page in 0..4 {
            assert_eq!(
                cache.insert(key(1, page, 2000), page, 10 * MB, focus(0)),
                Vec::<u32>::new()
            );
        }
        // reading page 3 now: page 0 is furthest
        let evicted = cache.insert(key(1, 4, 2000), 4, 10 * MB, focus(3));
        assert_eq!(evicted, vec![0]);
        assert_eq!(cache.bytes(), 40 * MB);
        assert_eq!(cache.peak(), 40 * MB);
        assert!(!cache.contains(&key(1, 0, 2000)));
    }

    #[test]
    fn evicts_other_documents_and_scales_first() {
        let mut cache = TileCache::new(30 * MB);
        cache.insert(key(1, 5, 2000), 0, 10 * MB, focus(5));
        cache.insert(key(1, 5, 1000), 1, 10 * MB, focus(5)); // an old zoom
        cache.insert(key(9, 5, 2000), 2, 10 * MB, focus(5)); // a closed reload
        let evicted = cache.insert(key(1, 6, 2000), 3, 15 * MB, focus(5));
        assert_eq!(evicted.len(), 2);
        assert!(evicted.contains(&1) && evicted.contains(&2));
        assert!(cache.contains(&key(1, 5, 2000)));
        assert!(cache.bytes() <= 30 * MB);
    }

    #[test]
    fn ties_go_to_the_least_recently_used() {
        let mut cache = TileCache::new(20 * MB);
        cache.insert(key(1, 2, 2000), 2, 10 * MB, focus(3));
        cache.insert(key(1, 4, 2000), 4, 10 * MB, focus(3));
        cache.get(&key(1, 2, 2000));
        assert_eq!(cache.insert(key(1, 3, 2000), 3, 10 * MB, focus(3)), vec![4]);
    }

    #[test]
    fn replacing_and_clearing_keep_the_count() {
        let mut cache = TileCache::new(100 * MB);
        cache.insert(key(1, 0, 2000), 0, 10 * MB, focus(0));
        assert_eq!(cache.insert(key(1, 0, 2000), 1, 5 * MB, focus(0)), vec![0]);
        assert_eq!(cache.bytes(), 5 * MB);
        assert_eq!(cache.retain(|k| k.page != 0), vec![1]);
        assert_eq!(cache.bytes(), 0);
        cache.insert(key(1, 1, 2000), 2, 5 * MB, focus(0));
        assert_eq!(cache.clear(), vec![2]);
        assert!(cache.is_empty() && cache.bytes() == 0);
        assert_eq!(cache.peak(), 10 * MB);
    }
}
