use glib::variant::ToVariant;

// GLib is optimized in the test profile: the original immutable out-pointer
// becomes a null dereference under optimization (RUSTSEC-2024-0429).
#[test]
fn string_variant_iteration_is_safe_in_both_directions() {
    let strings = ["Alpha", "O'Connor", "がんばれ", "Final player"];
    let variant = strings.to_variant();
    assert_eq!(
        variant.array_iter_str().unwrap().collect::<Vec<_>>(),
        strings
    );
    assert_eq!(
        variant.array_iter_str().unwrap().rev().collect::<Vec<_>>(),
        strings.into_iter().rev().collect::<Vec<_>>()
    );
    let mut iterator = variant.array_iter_str().unwrap();
    assert_eq!(iterator.next(), Some("Alpha"));
    assert_eq!(iterator.next_back(), Some("Final player"));
    assert_eq!(iterator.next(), Some("O'Connor"));
    assert_eq!(iterator.next_back(), Some("がんばれ"));
    assert_eq!(iterator.next(), None);
    assert_eq!(variant.array_iter_str().unwrap().nth(2), Some("がんばれ"));
    assert_eq!(
        variant.array_iter_str().unwrap().nth_back(2),
        Some("O'Connor")
    );
    assert_eq!(
        variant.array_iter_str().unwrap().last(),
        Some("Final player")
    );
    assert_eq!(
        Vec::<String>::new()
            .to_variant()
            .array_iter_str()
            .unwrap()
            .next(),
        None
    );
}
