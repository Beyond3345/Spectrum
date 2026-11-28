use super::*;

const MIXED: &str =
    "\\section{Intro}\n我們喺呢度 CJK\nemoji 😀 and 👩‍👩‍👧 here\n\naccents: café, naïve\nlast";

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// The same answers worked out the slow way, straight from the string.
fn naive_point(text: &str, offset: usize) -> (Point, PointUtf16) {
    let before = &text[..offset];
    let line = before.matches('\n').count();
    let line_start = before.rfind('\n').map_or(0, |i| i + 1);
    let column = offset - line_start;
    let utf16 = utf16_len(&text[line_start..offset]);
    (
        Point { line, column },
        PointUtf16 {
            line,
            column: utf16,
        },
    )
}

#[test]
fn empty_buffer_is_one_empty_line() {
    let b = Buffer::new();
    assert!(b.is_empty());
    assert_eq!(b.len_lines(), 1);
    assert_eq!(b.line_range(0), 0..0);
    assert_eq!(b.line_range(7), 0..0);
    assert_eq!(b.offset_to_point(0), Point::default());
    assert_eq!(b.offset_to_point(99), Point::default());
    assert_eq!(b.offset_to_point_utf16(99), PointUtf16::default());
    assert_eq!(b.point_to_offset(Point { line: 3, column: 9 }), 0);
    assert_eq!(
        b.point_utf16_to_offset(PointUtf16 { line: 3, column: 9 }),
        0
    );
    assert_eq!(b.utf16_to_offset(5), 0);
    assert_eq!(b.char_to_offset(5), 0);
    assert_eq!(b.text(), "");
    assert_eq!(b.file_text(), "");
}

#[test]
fn every_boundary_converts_like_the_slow_way_and_back() {
    let b = Buffer::from_text(MIXED);
    let ends = MIXED.char_indices().chain([(MIXED.len(), ' ')]);
    for (chars, (offset, c)) in ends.enumerate() {
        let (point, point16) = naive_point(MIXED, offset);
        assert_eq!(b.offset_to_point(offset), point, "byte point at {offset}");
        assert_eq!(
            b.offset_to_point_utf16(offset),
            point16,
            "utf16 point at {offset}"
        );
        assert_eq!(b.point_to_offset(point), offset);
        assert_eq!(b.point_utf16_to_offset(point16), offset);
        assert_eq!(b.offset_to_utf16(offset), utf16_len(&MIXED[..offset]));
        assert_eq!(b.utf16_to_offset(utf16_len(&MIXED[..offset])), offset);
        assert_eq!(b.offset_to_char(offset), chars);
        assert_eq!(b.char_to_offset(chars), offset);
        // every byte inside the character clips back to its start
        for inside in offset + 1..(offset + c.len_utf8()).min(MIXED.len()) {
            assert_eq!(b.clip(inside), offset);
            assert_eq!(b.offset_to_point(inside), point);
        }
    }
    assert_eq!(b.len_chars(), MIXED.chars().count());
    assert_eq!(b.len_utf16(), utf16_len(MIXED));
}

#[test]
fn cjk_takes_three_bytes_and_one_utf16_unit() {
    let b = Buffer::from_text("a我們b");
    assert_eq!(b.len(), 8);
    assert_eq!(
        b.offset_to_point_utf16(7),
        PointUtf16 { line: 0, column: 3 }
    );
    assert_eq!(b.range_to_utf16(1..7), 1..3);
    assert_eq!(b.range_from_utf16(1..3), 1..7);
    assert_eq!(b.slice(1..7).to_string(), "我們");
    // a range that cuts both characters is widened to whole ones
    assert_eq!(b.slice(2..5).to_string(), "我們");
}

#[test]
fn emoji_is_a_surrogate_pair() {
    let b = Buffer::from_text("x😀y\n😀");
    assert_eq!(b.len_utf16(), 7);
    assert_eq!(b.offset_to_utf16(5), 3);
    assert_eq!(b.utf16_to_offset(3), 5);
    // the middle of the pair is the start of the emoji
    assert_eq!(b.utf16_to_offset(2), 1);
    let low_surrogate = PointUtf16 { line: 0, column: 2 };
    assert_eq!(b.point_utf16_to_offset(low_surrogate), 1);
    let second_line = PointUtf16 { line: 1, column: 2 };
    assert_eq!(b.point_utf16_to_offset(second_line), b.len());
    assert_eq!(b.offset_to_point_utf16(b.len()), second_line);
}

#[test]
fn positions_past_the_end_clamp() {
    let b = Buffer::from_text("ab\ncde\n");
    assert_eq!(b.len_lines(), 3);
    assert_eq!(b.line_range(0), 0..2);
    assert_eq!(b.line_range(1), 3..6);
    assert_eq!(b.line_range(2), 7..7);
    assert_eq!(b.line(1).to_string(), "cde");
    // a column past the line's end stops before the line break
    let far = PointUtf16 {
        line: 0,
        column: 50,
    };
    assert_eq!(b.point_utf16_to_offset(far), 2);
    assert_eq!(
        b.point_to_offset(Point {
            line: 1,
            column: 50
        }),
        6
    );
    assert_eq!(b.point_to_offset(Point { line: 9, column: 0 }), 7);
    assert_eq!(b.clip(1000), 7);
    assert_eq!(b.utf16_to_offset(1000), 7);
    assert_eq!(b.char_to_offset(1000), 7);
    assert_eq!(b.slice(5..1000).to_string(), "e\n");
}

#[test]
fn crlf_is_lf_in_memory_and_crlf_on_save() {
    let file = "one\r\ntwo\r\n\r\nfour";
    let b = Buffer::from_text(file);
    assert_eq!(b.line_ending(), LineEnding::CrLf);
    assert_eq!(b.text(), "one\ntwo\n\nfour");
    assert_eq!(b.len_lines(), 4);
    assert_eq!(b.line_range(1), 4..7);
    assert_eq!(b.file_text(), file);

    let mut b = b;
    b.set_line_ending(LineEnding::Lf);
    assert_eq!(b.file_text(), "one\ntwo\n\nfour");
}

#[test]
fn line_ending_follows_the_majority_and_lone_cr_is_a_break() {
    assert_eq!(LineEnding::detect(""), LineEnding::Lf);
    assert_eq!(LineEnding::detect("a\nb\r\nc\n"), LineEnding::Lf);
    assert_eq!(LineEnding::detect("a\r\nb\r\nc\n"), LineEnding::CrLf);
    let b = Buffer::from_text("a\rb\r\nc\nd");
    assert_eq!(b.text(), "a\nb\nc\nd");
    assert_eq!(b.len_lines(), 4);
    assert_eq!(normalise("plain"), "plain");
    assert!(matches!(normalise("plain"), Cow::Borrowed(_)));
}

#[test]
fn replace_reports_the_points_tree_sitter_and_the_lsp_need() {
    let mut b = Buffer::from_text("ab\n我😀d\nxyz");
    assert_eq!(b.version(), 0);
    // replace "😀d\nx" with "Q\nRS"
    let start = "ab\n我".len();
    let end = "ab\n我😀d\nx".len();
    let change = b.replace(start..end, "Q\nRS");
    assert_eq!(b.text(), "ab\n我Q\nRSyz");
    assert_eq!(b.version(), 1);
    assert_eq!(change.start, start);
    assert_eq!(change.removed, "😀d\nx");
    assert_eq!(change.inserted, "Q\nRS");
    assert_eq!(change.old_end(), end);
    assert_eq!(change.new_end(), start + 4);
    assert_eq!(change.start_point, Point { line: 1, column: 3 });
    assert_eq!(change.old_end_point, Point { line: 2, column: 1 });
    assert_eq!(change.new_end_point, Point { line: 2, column: 2 });
    assert_eq!(change.start_utf16, PointUtf16 { line: 1, column: 1 });
    assert_eq!(change.old_end_utf16, PointUtf16 { line: 2, column: 1 });
}

#[test]
fn edits_at_the_boundaries() {
    let mut b = Buffer::new();
    b.replace(0..0, "middle");
    b.replace(0..0, "start ");
    let end = b.len();
    b.replace(end..end, " end");
    assert_eq!(b.text(), "start middle end");
    // past the end is the end; a reversed range is empty at its start
    b.replace(500..900, "!");
    assert_eq!(b.text(), "start middle end!");
    b.replace(0..b.len(), "");
    assert!(b.is_empty());
    assert_eq!(b.len_lines(), 1);
    assert_eq!(b.version(), 5);

    let mut b = Buffer::from_text("a\nb");
    b.replace(1..2, "");
    assert_eq!((b.text().as_str(), b.len_lines()), ("ab", 1));
    b.replace(2..2, "\n");
    assert_eq!(b.len_lines(), 2);
    assert_eq!(b.line_range(1), 3..3);
}

#[test]
fn replace_never_splits_a_character() {
    let mut b = Buffer::from_text("a😀b");
    // 2 and 4 are inside the emoji: the whole emoji goes
    let change = b.replace(2..4, "-");
    assert_eq!(b.text(), "a-b");
    assert_eq!(change.removed, "😀");
}

#[test]
fn map_offset_follows_an_insertion_a_deletion_and_a_replacement() {
    let mut b = Buffer::from_text("0123456789");
    let insert = b.replace(4..4, "ab");
    assert_eq!(insert.map_offset(3, Bias::Right), 3);
    assert_eq!(insert.map_offset(4, Bias::Left), 4);
    assert_eq!(insert.map_offset(4, Bias::Right), 6);
    assert_eq!(insert.map_offset(5, Bias::Left), 7);

    let delete = b.replace(2..6, "");
    assert_eq!(delete.map_offset(2, Bias::Right), 2);
    assert_eq!(delete.map_offset(4, Bias::Left), 2);
    assert_eq!(delete.map_offset(4, Bias::Right), 2);
    assert_eq!(delete.map_offset(6, Bias::Left), 2);
    assert_eq!(delete.map_offset(8, Bias::Left), 4);

    let replace = b.replace(1..3, "xyz");
    assert_eq!(replace.map_offset(1, Bias::Right), 1);
    assert_eq!(replace.map_offset(2, Bias::Left), 1);
    assert_eq!(replace.map_offset(2, Bias::Right), 4);
    assert_eq!(replace.map_offset(3, Bias::Left), 4);
}
