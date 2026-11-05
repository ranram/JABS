use crate::versus_screen::MediaTransform;
use std::collections::BTreeMap;

pub type ArtworkFraming = BTreeMap<String, MediaTransform>;

pub fn valid(framing: &ArtworkFraming) -> bool {
    framing.len() <= 2048
        && framing.iter().all(|(key, transform)| {
            key.encode_utf16().count() <= 1024
                && transform.x.is_finite()
                && (-2.0..=2.0).contains(&transform.x)
                && transform.y.is_finite()
                && (-2.0..=2.0).contains(&transform.y)
                && transform.scale.is_finite()
                && (0.1..=8.0).contains(&transform.scale)
        })
}
