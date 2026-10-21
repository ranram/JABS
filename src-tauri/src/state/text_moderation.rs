use super::{Player, SelectedSet};
use crate::moderation;

pub fn censor_untrusted_selected_set(selected_set: &mut SelectedSet) {
    let generated_display_name = selected_set.display_name == "[blocked]"
        || selected_set.display_name
        == format!(
            "{} vs {}",
            selected_set.player_one.name, selected_set.player_two.name
        );
    selected_set.phase = moderation::censor(selected_set.phase.take());
    selected_set.tournament_name = moderation::censor(selected_set.tournament_name.take());
    selected_set.phase_group = moderation::censor(selected_set.phase_group.take());
    selected_set.round = moderation::censor(selected_set.round.take());
    selected_set.station = moderation::censor(selected_set.station.take());
    censor_player(&mut selected_set.player_one);
    censor_player(&mut selected_set.player_two);
    selected_set.display_name = if generated_display_name {
        format!(
            "{} vs {}",
            selected_set.player_one.name, selected_set.player_two.name
        )
    } else {
        censor_required(&selected_set.display_name)
    };
    if let Some(broadcast) = &mut selected_set.broadcast {
        broadcast.info_left = moderation::censor(broadcast.info_left.take());
        broadcast.info_right = moderation::censor(broadcast.info_right.take());
    }
}

fn censor_player(player: &mut Player) {
    player.name = censor_required(&player.name);
    player.prefix = moderation::censor(player.prefix.take());
    player.sponsor = moderation::censor(player.sponsor.take());
    player.x_handle = moderation::censor(player.x_handle.take());
    player.characters = player.characters.drain(..)
        .filter_map(|character| moderation::censor_character(Some(character)))
        .collect();
    player.character = player.characters.first().cloned();
    player.pronouns = moderation::censor(player.pronouns.take());
}

fn censor_required(value: &str) -> String {
    moderation::censor(Some(value.to_owned())).unwrap_or_else(|| "[blocked]".to_owned())
}

pub(super) fn assert_safe_state(selected_set: &SelectedSet) -> Result<(), String> {
    let generated_display_name = format!(
        "{} vs {}",
        selected_set.player_one.name, selected_set.player_two.name
    );
    if selected_set.display_name != generated_display_name {
        moderation::assert_safe(&[(
            "Display name",
            Some(selected_set.display_name.as_str()),
        )])?;
    }
    moderation::assert_safe(&[
        ("Tournament", selected_set.tournament_name.as_deref()),
        ("Phase", selected_set.phase.as_deref()),
        ("Pool", selected_set.phase_group.as_deref()),
        ("Round", selected_set.round.as_deref()),
        ("Station", selected_set.station.as_deref()),
        ("Player one name", Some(selected_set.player_one.name.as_str())),
        ("Player one prefix", selected_set.player_one.prefix.as_deref()),
        ("Player one sponsor", selected_set.player_one.sponsor.as_deref()),
        ("Player one x.com handle", selected_set.player_one.x_handle.as_deref()),
        ("Player one pronouns", selected_set.player_one.pronouns.as_deref()),
        ("Player two name", Some(selected_set.player_two.name.as_str())),
        ("Player two prefix", selected_set.player_two.prefix.as_deref()),
        ("Player two sponsor", selected_set.player_two.sponsor.as_deref()),
        ("Player two x.com handle", selected_set.player_two.x_handle.as_deref()),
        ("Player two pronouns", selected_set.player_two.pronouns.as_deref()),
        ("Left broadcast text", selected_set.broadcast.as_ref().and_then(|value| value.info_left.as_deref())),
        ("Right broadcast text", selected_set.broadcast.as_ref().and_then(|value| value.info_right.as_deref())),
    ])?;
    for (label, player) in [
        ("Player one character", &selected_set.player_one),
        ("Player two character", &selected_set.player_two),
    ] {
        for character in &player.characters {
            if moderation::contains_blocked_text_for_character(character) {
                return Err(format!(
                    "Blocked offensive text in {}. Remove it before saving stream state.",
                    label
                ));
            }
        }
    }
    Ok(())
}
