//! A small XML tree over quick-xml, for arXiv's Atom and PubMed's efetch answers.

use quick_xml::Reader;
use quick_xml::events::Event;

use crate::text::decode_entities;

/// An element: its name without prefix (`doi` for `arxiv:doi`), its prefixed name, attributes and children.
#[derive(Debug, Clone, Default)]
pub(crate) struct Node {
    pub name: String,
    pub qname: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<Child>,
}

#[derive(Debug, Clone)]
pub(crate) enum Child {
    Element(Node),
    Text(String),
}

// a block parts words, inline markup (<i>, <sup>) doesn't
const BLOCKS: &[&str] = &["p", "sec", "title", "br", "div", "list-item"];

impl Node {
    pub fn elements(&self) -> impl Iterator<Item = &Node> {
        self.children.iter().filter_map(|c| match c {
            Child::Element(n) => Some(n),
            Child::Text(_) => None,
        })
    }

    /// The children named so (prefixed name, as `arxiv:doi`, or plain).
    pub fn all<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Node> + 'a {
        self.elements().filter(move |n| n.qname == name)
    }

    pub fn first<'a>(&'a self, name: &'a str) -> Option<&'a Node> {
        self.all(name).next()
    }

    /// The path of names below this one.
    pub fn at<'a>(&'a self, path: &[&'a str]) -> Option<&'a Node> {
        path.iter().try_fold(self, |n, name| n.first(name))
    }

    pub fn attr(&self, name: &str) -> &str {
        self.attrs
            .iter()
            .find(|(k, _)| k == name)
            .map_or("", |(_, v)| v.as_str())
    }

    /// Every text inside, block elements set apart by spaces; not squashed.
    pub fn text(&self) -> String {
        let mut out = String::new();
        for c in &self.children {
            match c {
                Child::Text(t) => out.push_str(t),
                Child::Element(n) if BLOCKS.contains(&n.name.as_str()) => {
                    out.push(' ');
                    out.push_str(&n.text());
                    out.push(' ');
                }
                Child::Element(n) => out.push_str(&n.text()),
            }
        }
        out
    }

    /// The text of the first child named so, or "".
    pub fn child_text(&self, name: &str) -> String {
        self.first(name).map(Node::text).unwrap_or_default()
    }
}

fn local(name: &str) -> String {
    name.rsplit(':').next().unwrap_or(name).to_owned()
}

fn open(e: &quick_xml::events::BytesStart<'_>) -> Node {
    let qname = e.name().as_ref().to_owned();
    let attrs = e
        .attributes()
        .flatten()
        .map(|a| {
            let key = a.key.as_ref().to_owned();
            let value = decode_entities(&a.value);
            (key, value)
        })
        .collect();
    Node {
        name: local(&qname),
        qname,
        attrs,
        children: Vec::new(),
    }
}

/// The document's root element; `None` when it isn't XML.
pub(crate) fn parse(xml: &str) -> Option<Node> {
    let mut reader = Reader::from_str(xml);
    let mut stack: Vec<Node> = vec![Node::default()];
    loop {
        match reader.read_event().ok()? {
            Event::Start(e) => stack.push(open(&e)),
            Event::Empty(e) => {
                let node = open(&e);
                stack.last_mut()?.children.push(Child::Element(node));
            }
            Event::End(_) => {
                let node = stack.pop()?;
                stack.last_mut()?.children.push(Child::Element(node));
            }
            Event::Text(t) => {
                let text = t.html_content().into_owned();
                stack.last_mut()?.children.push(Child::Text(text));
            }
            Event::GeneralRef(r) => {
                let name = r.to_string();
                stack
                    .last_mut()?
                    .children
                    .push(Child::Text(decode_entities(&format!("&{name};"))));
            }
            Event::CData(c) => {
                let text = c.into_inner().into_owned();
                stack.last_mut()?.children.push(Child::Text(text));
            }
            Event::Eof => break,
            _ => {}
        }
    }
    let doc = stack.into_iter().next()?;
    doc.elements().next().cloned()
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_elements_text_and_entities() {
        let root = super::parse("<?xml version=\"1.0\"?><feed xmlns:arxiv=\"x\"><entry><title>A &amp; B <i>c</i></title><arxiv:doi>10.1/x</arxiv:doi><cat term=\"cs.LG\"/></entry></feed>").unwrap();
        let entry = root.first("entry").unwrap();
        assert_eq!(entry.child_text("title"), "A & B c");
        assert_eq!(entry.child_text("arxiv:doi"), "10.1/x");
        assert_eq!(entry.first("cat").unwrap().attr("term"), "cs.LG");
    }
}
