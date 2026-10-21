pub const CONTEXT: &str = r#"
query PlayerStatsContext($eventId: ID!) {
  event(id: $eventId) { id videogame { id } tournament { id name } }
}
"#;

pub const PLACEMENTS: &str = r#"
query PlayerStatsPlacements($playerId: ID!, $videogameId: ID!) {
  player(id: $playerId) {
    recentStandings(videogameId: $videogameId, limit: 5) {
      placement
      entrant { event { id name numEntrants videogame { id } tournament { id name startAt images(type: "profile") { url } } } }
    }
  }
}
"#;

const SET_FIELDS: &str = r#"
fragment StatsSet on Set {
  id state completedAt winnerId fullRoundText
  event { id name tournament { id } }
  phaseGroup { phase { name } }
  slots {
    entrant { id name participants { player { id } } }
    standing { stats { score { value } } }
  }
}
"#;

pub fn run_query() -> String {
    let query = r#"
query EntrantStatsRun($eventId: ID!, $entrantId: ID!, $page: Int!) {
  event(id: $eventId) {
    sets(page: $page, perPage: 20, sortType: STANDARD, filters: { entrantIds: [$entrantId], state: [3], showByes: false }) {
      pageInfo { totalPages } nodes { ...StatsSet }
    }
  }
}
"#;
    format!("{query}\n{SET_FIELDS}")
}
