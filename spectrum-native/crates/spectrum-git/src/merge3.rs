//! Three-way merge by lines, as git merge-file does it (2.8's `merge3.js`): each side's changes from the base
//! become hunks in the base's lines, and hunks from the two sides that overlap or touch must give the same
//! text, else it's a conflict. Lines the base repeats are read both as the diff places a change and slid up
//! as git does; the merge is clean only where both readings agree.

use std::time::{Duration, Instant};

use similar::{Algorithm, DiffOp, capture_diff_slices_deadline};

/// Past this many changed lines a merge is better left to the user (2.8's `maxEditLength`).
const MAX_EDIT_LENGTH: usize = 2000;
const DEADLINE: Duration = Duration::from_millis(500);

#[derive(Clone)]
struct H<'a> {
    start: usize,
    end: usize,
    lines: Vec<&'a str>,
    side: u8,
}

/// A text's lines, each with its '\n' (the last may lack one).
fn lines(text: &str) -> Vec<&str> {
    text.split_inclusive('\n').collect()
}

/// The changes from base to other: base lines [start, end) become `lines`. `None` when there are too many.
fn hunks<'a>(base: &[&str], other: &[&'a str], side: u8) -> Option<Vec<H<'a>>> {
    let ops = capture_diff_slices_deadline(
        Algorithm::Myers,
        base,
        other,
        Some(Instant::now() + DEADLINE),
    );
    let mut found: Vec<H<'a>> = Vec::new();
    let mut changed = 0;
    let mut open = false;
    for op in ops {
        match op {
            DiffOp::Equal { .. } => open = false,
            DiffOp::Delete {
                old_index, old_len, ..
            } => {
                changed += old_len;
                if !open {
                    found.push(H {
                        start: old_index,
                        end: old_index,
                        lines: Vec::new(),
                        side,
                    });
                    open = true;
                }
                if let Some(h) = found.last_mut() {
                    h.end = old_index + old_len;
                }
            }
            DiffOp::Insert {
                old_index,
                new_index,
                new_len,
            } => {
                changed += new_len;
                if !open {
                    found.push(H {
                        start: old_index,
                        end: old_index,
                        lines: Vec::new(),
                        side,
                    });
                    open = true;
                }
                if let Some(h) = found.last_mut() {
                    h.lines
                        .extend_from_slice(&other[new_index..new_index + new_len]);
                }
            }
            DiffOp::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                changed += old_len + new_len;
                if !open {
                    found.push(H {
                        start: old_index,
                        end: old_index,
                        lines: Vec::new(),
                        side,
                    });
                    open = true;
                }
                if let Some(h) = found.last_mut() {
                    h.end = old_index + old_len;
                    h.lines
                        .extend_from_slice(&other[new_index..new_index + new_len]);
                }
            }
        }
    }
    (changed <= MAX_EDIT_LENGTH).then_some(found)
}

/// A deletion or insertion the diff left a run of repeated lines away from the side's previous change is
/// slid up to it, as git's diff does.
fn compact<'a>(found: &[H<'a>], base: &[&str]) -> Vec<H<'a>> {
    let mut out: Vec<H<'a>> = Vec::new();
    for h in found {
        if let Some(a) = out.last_mut() {
            let g = h.start - a.end;
            if g > 0 && h.end > h.start && h.lines.is_empty() {
                if (1..=g).all(|k| base[h.start - k] == base[h.end - k]) {
                    a.end += h.end - h.start;
                    continue;
                }
            } else if g > 0 && h.end == h.start {
                let mut y = h.lines.clone();
                let mut ok = true;
                for k in 1..=g {
                    ok = y.last() == Some(&base[h.start - k]);
                    if !ok {
                        break;
                    }
                    y.rotate_right(1);
                }
                if ok {
                    a.lines.extend(y);
                    continue;
                }
            }
        }
        out.push(h.clone());
    }
    out
}

fn merge(base: &[&str], mine: &[H], theirs: &[H]) -> Option<String> {
    let mut all: Vec<&H> = mine.iter().chain(theirs).collect();
    all.sort_by(|a, b| a.start.cmp(&b.start).then(a.end.cmp(&b.end)));
    let mut out = String::new();
    let mut done = 0;
    let mut k = 0;
    while k < all.len() {
        let mut group = vec![all[k]];
        let mut end = all[k].end;
        k += 1;
        while k < all.len() && all[k].start <= end {
            group.push(all[k]);
            end = end.max(all[k].end);
            k += 1;
        }
        let start = group[0].start;
        let text = |side: u8| {
            let mut s = String::new();
            let mut at = start;
            for h in group.iter().filter(|g| g.side == side) {
                s.extend(base[at..h.start].iter().copied());
                s.extend(h.lines.iter().copied());
                at = h.end;
            }
            s.extend(base[at..end].iter().copied());
            s
        };
        let (has0, has1) = (
            group.iter().any(|g| g.side == 0),
            group.iter().any(|g| g.side == 1),
        );
        if has0 && has1 && text(0) != text(1) {
            return None;
        }
        out.extend(base[done..start].iter().copied());
        out.push_str(&text(u8::from(!has0)));
        done = end;
    }
    out.extend(base[done..].iter().copied());
    Some(out)
}

/// The merged text, or `None` where both sides changed the same or touching lines differently.
pub(crate) fn merge3(base: &str, local: &str, cloud: &str) -> Option<String> {
    let (b, l, c) = (lines(base), lines(local), lines(cloud));
    let mine = hunks(&b, &l, 0)?;
    let theirs = hunks(&b, &c, 1)?;
    let merged = merge(&b, &compact(&mine, &b), &compact(&theirs, &b))?;
    // sliding can move one side's change off the other's same change, and then both go in
    (Some(&merged) == merge(&b, &mine, &theirs).as_ref()).then_some(merged)
}

/// `merge3` on bytes, any encoding byte for byte (as Latin-1), CRLF read as LF: `None` for a binary file
/// (a NUL in the first 8000 bytes) or a conflict. The result has the line ends `local` has.
pub(crate) fn merge_text(base: &[u8], local: &[u8], cloud: &[u8]) -> Option<Vec<u8>> {
    let binary = |b: &[u8]| b[..b.len().min(8000)].contains(&0);
    if [base, local, cloud].iter().any(|b| binary(b)) {
        return None;
    }
    let decode = |b: &[u8]| {
        b.iter()
            .map(|&x| char::from(x))
            .collect::<String>()
            .replace("\r\n", "\n")
    };
    let merged = merge3(&decode(base), &decode(local), &decode(cloud))?;
    let crlf = local.windows(2).any(|w| w == b"\r\n");
    let merged = if crlf {
        merged.replace('\n', "\r\n")
    } else {
        merged
    };
    // every char came from one byte, so each fits in one again
    Some(
        merged
            .chars()
            .map(|c| u8::try_from(u32::from(c)).unwrap_or(b'?'))
            .collect(),
    )
}

#[cfg(test)]
#[allow(clippy::format_collect)]
mod tests {
    use super::*;

    fn doc(lines: &[&str]) -> String {
        lines.iter().map(|l| format!("{l}\n")).collect()
    }

    fn paper() -> String {
        doc(&[
            "\\section{One}",
            "First paragraph.",
            "",
            "\\section{Two}",
            "Second paragraph.",
            "",
            "\\section{Three}",
            "Third paragraph.",
        ])
    }

    #[test]
    fn separate_paragraphs_both_go_in_and_touching_lines_conflict() {
        let p = paper();
        let here = p.replace("First paragraph.", "First, edited here.");
        let there = p.replace("Third paragraph.", "Third, edited there.");
        assert_eq!(
            merge3(&p, &here, &there),
            Some(here.replace("Third paragraph.", "Third, edited there."))
        );
        assert_eq!(
            merge3(
                &doc(&["a", "b", "c", "d"]),
                &doc(&["a", "B", "c", "d"]),
                &doc(&["a", "b", "C", "d"])
            ),
            None
        );
        let changed = p.replace("Second", "Changed");
        assert_eq!(merge3(&p, &changed, &changed), Some(changed.clone()));
    }

    #[test]
    fn partly_same_changes() {
        assert_eq!(
            merge3(
                &doc(&["a", "b", "c", "d", "e"]),
                &doc(&["a", "X", "Y", "d", "e"]),
                &doc(&["a", "X", "Z", "d", "e"])
            ),
            None
        );
        assert_eq!(
            merge3(
                &doc(&["a", "b", "c", "d", "e", "f", "g"]),
                &doc(&["a", "X", "c", "d", "e", "F", "g"]),
                &doc(&["a", "X", "c", "d", "e", "f", "g"])
            ),
            Some(doc(&["a", "X", "c", "d", "e", "F", "g"]))
        );
    }

    #[test]
    fn repeated_lines_keep_each_change_in_its_place() {
        let lists = doc(&[
            "\\begin{itemize}",
            "\\item A",
            "\\end{itemize}",
            "",
            "\\begin{itemize}",
            "\\item B",
            "\\end{itemize}",
            "",
            "End.",
        ]);
        let here = lists.replace("\\item A\n", "\\item A\n\\item A2\n");
        let there = lists.replace("\\item B\n", "\\item B\n\\item B2\n");
        assert_eq!(
            merge3(&lists, &here, &there),
            Some(here.replace("\\item B\n", "\\item B\n\\item B2\n"))
        );
        let spaced = doc(&["One.", "", "", "Two.", "", "", "Three."]);
        assert_eq!(
            merge3(
                &spaced,
                &doc(&["One.", "", "Inserted here.", "", "Two.", "", "", "Three."]),
                &doc(&["One.", "", "", "Two.", "", "Inserted there.", "", "Three."])
            ),
            Some(doc(&[
                "One.",
                "",
                "Inserted here.",
                "",
                "Two.",
                "",
                "Inserted there.",
                "",
                "Three."
            ]))
        );
        assert_eq!(
            merge3(
                &doc(&["a & b \\\\", "\\hline", "\\hline", "c & d \\\\"]),
                &doc(&["a & b \\\\", "\\hline", "c & d \\\\"]),
                &doc(&["a & b \\\\", "\\midrule", "\\hline", "c & d \\\\"])
            ),
            None
        );
        assert_eq!(
            merge3(
                &doc(&["\\foo{", "}", "}"]),
                &doc(&["\\foo{", "}"]),
                &doc(&["\\foo{x", "}", "}"])
            ),
            Some(doc(&["\\foo{x", "}"]))
        );
    }

    #[test]
    fn ends_line_endings_latin1_and_binary() {
        assert_eq!(
            merge3(
                &doc(&["a", "b", "c"]),
                &doc(&["first", "a", "b", "c"]),
                &doc(&["a", "b", "c", "last"])
            ),
            Some(doc(&["first", "a", "b", "c", "last"]))
        );
        assert_eq!(
            merge3("a\nb\nc\nd\ne", "A\nb\nc\nd\ne", "a\nb\nc\nd\nE"),
            Some("A\nb\nc\nd\nE".into())
        );
        let p = paper();
        let crlf = p.replace('\n', "\r\n");
        let cloud = p.replace("Second", "Changed");
        assert_eq!(
            merge_text(p.as_bytes(), crlf.as_bytes(), cloud.as_bytes()).unwrap(),
            cloud.replace('\n', "\r\n").into_bytes()
        );
        assert_eq!(
            merge_text(p.as_bytes(), cloud.as_bytes(), crlf.as_bytes()).unwrap(),
            cloud.clone().into_bytes()
        );
        let latin = |extra: &[u8]| {
            let mut v = b"Caf\xe9.\n".to_vec();
            for i in 0..10 {
                v.extend(format!("Line {i}.\n").bytes());
            }
            v.extend(extra);
            v
        };
        // \usepackage[latin1]{inputenc}: é is the byte 0xE9, which isn't UTF-8
        let base = latin(b"R\xe9sum\xe9.\n");
        let local = [&base[..], b"local tail\n"].concat();
        let mut cloud_b = base.clone();
        cloud_b.splice(0..0, b"cloud head\n".iter().copied());
        assert_eq!(
            merge_text(&base, &local, &cloud_b).unwrap(),
            [b"cloud head\n" as &[u8], &base, b"local tail\n"].concat()
        );
        let binary = [b"PK\x03\x04\0\0\0\0" as &[u8], p.as_bytes()].concat();
        assert_eq!(merge_text(p.as_bytes(), &binary, cloud.as_bytes()), None);
    }

    #[test]
    fn a_huge_rewrite_on_both_sides_is_a_quick_conflict_and_a_few_changes_still_merge() {
        let lines: Vec<String> = (0..20000)
            .map(|i| {
                format!(
                    "@article{{key{i}, title={{Title {i}}}, year={{20{}}}}},",
                    i % 100
                )
            })
            .collect();
        let base = lines.iter().map(|l| format!("{l}\n")).collect::<String>();
        let local = lines
            .iter()
            .enumerate()
            .map(|(i, l)| {
                if i % 2 == 1 {
                    format!("{l}\n")
                } else {
                    format!("{l} %here\n")
                }
            })
            .collect::<String>();
        let cloud = lines
            .iter()
            .enumerate()
            .map(|(i, l)| {
                if i % 3 == 1 {
                    format!("{l} %there\n")
                } else {
                    format!("{l}\n")
                }
            })
            .collect::<String>();
        let started = Instant::now();
        assert_eq!(merge3(&base, &local, &cloud), None);
        assert!(
            started.elapsed() < Duration::from_secs(4),
            "took {:?}",
            started.elapsed()
        );
        let few = |tag: &str, at: usize| {
            lines
                .iter()
                .enumerate()
                .map(|(i, l)| {
                    if i == at {
                        format!("{l} {tag}\n")
                    } else {
                        format!("{l}\n")
                    }
                })
                .collect::<String>()
        };
        let want = lines
            .iter()
            .enumerate()
            .map(|(i, l)| match i {
                100 => format!("{l} %here\n"),
                15000 => format!("{l} %there\n"),
                _ => format!("{l}\n"),
            })
            .collect::<String>();
        assert_eq!(
            merge3(&base, &few("%here", 100), &few("%there", 15000)),
            Some(want)
        );
    }
}
