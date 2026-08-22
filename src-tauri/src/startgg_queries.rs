pub const EVENTS: &str = r#"
query EventsByTournament($slug: String!) {
  tournament(slug: $slug) {
    events {
      id
      name
      videogame { id name }
    }
  }
}
"#;

pub const STREAM_QUEUE: &str = r#"
query TournamentStreamQueue($slug: String!) {
  tournament(slug: $slug) {
    streamQueue {
      stream { streamName }
      sets { id }
    }
  }
}
"#;

pub const PHASES: &str = r#"
query EventPhases($eventId: ID!) {
  event(id: $eventId) {
    phases { id name }
  }
}
"#;

pub const EVENT_STANDINGS: &str = r#"
query EventStandings($eventId: ID!) {
  event(id: $eventId) {
    id
    name
    slug
    numEntrants
    state
    videogame { id name }
    standings(query: { page: 1, perPage: 8 }) {
      nodes {
        placement
        isFinal
        entrant {
          id
          name
          participants {
            id
            gamerTag
            prefix
            user { location { country } }
            player { id }
          }
        }
      }
    }
  }
}
"#;

pub const EVENT_STANDINGS_BY_SLUG: &str = r#"
query EventStandingsBySlug($eventSlug: String!) {
  event(slug: $eventSlug) {
    id
    name
    slug
    numEntrants
    state
    videogame { id name }
    standings(query: { page: 1, perPage: 8 }) {
      nodes {
        placement
        isFinal
        entrant {
          id
          name
          participants {
            id
            gamerTag
            prefix
            user { location { country } }
            player { id }
          }
        }
      }
    }
  }
}
"#;

pub const PHASE_GROUPS: &str = r#"
query PhaseGroupsByPhase($phaseId: ID!, $page: Int!, $perPage: Int!) {
  phase(id: $phaseId) {
    phaseGroups(query: { page: $page, perPage: $perPage }) {
      pageInfo { total totalPages }
      nodes { id displayIdentifier }
    }
  }
}
"#;

pub const SET_BY_ID: &str = r#"
query SetById($setId: ID!) {
  set(id: $setId) {
    id
    displayScore
    fullRoundText
    event { videogame { id name } }
    phaseGroup {
      id
      displayIdentifier
      phase { id name }
    }
    state
    station { id number }
    slots {
      id
      slotIndex
      prereqId
      prereqPlacement
      prereqType
      entrant {
        id
        name
        initialSeedNum
        participants {
          id
          gamerTag
          prefix
          player { id }
          user {
            genderPronoun
            location { country state }
          }
        }
      }
      standing { stats { score { value } } }
    }
    games {
      selections {
        entrant { id }
        selectionType
        selectionValue
        character { id name }
      }
    }
  }
}
"#;

pub const VERSUS_HISTORY: &str = r#"
query VersusHistory($eventId: ID!, $playerOneId: ID!, $playerTwoId: ID!) {
  currentEvent: event(id: $eventId) { videogame { id } }
  playerOne: player(id: $playerOneId) {
    recentStandings {
      placement
      entrant { event { id name videogame { id } tournament { name startAt } } }
    }
  }
  playerTwo: player(id: $playerTwoId) {
    recentStandings {
      placement
      entrant { event { id name videogame { id } tournament { name startAt } } }
    }
  }
}
"#;

pub const EVENT_HEAD_TO_HEAD: &str = r#"
query EventHeadToHead($eventId: ID!, $entrantIds: [ID]!, $page: Int!, $perPage: Int!) {
  event(id: $eventId) {
    sets(
      page: $page
      perPage: $perPage
      sortType: STANDARD
      filters: { entrantIds: $entrantIds }
    ) {
      pageInfo { total totalPages }
      nodes {
        id
        state
        completedAt
        event { id name videogame { id } tournament { name } }
        slots {
          entrant { participants { player { id } } }
          standing { stats { score { value } } }
        }
      }
    }
  }
}
"#;

pub const PLAYER_SET_HISTORY: &str = r#"
query PlayerSetHistory($playerId: ID!, $page: Int!, $perPage: Int!) {
  player(id: $playerId) {
    sets(page: $page, perPage: $perPage) {
      pageInfo { total totalPages }
      nodes {
        id
        state
        completedAt
        event { id name videogame { id } tournament { name } }
        slots {
          entrant { participants { player { id } } }
          standing { stats { score { value } } }
        }
      }
    }
  }
}
"#;

pub const SET_PREREQUISITE_ROUNDS: &str = r#"
query SetPrerequisiteRounds($firstSetId: ID!, $secondSetId: ID!) {
  first: set(id: $firstSetId) { id fullRoundText }
  second: set(id: $secondSetId) { id fullRoundText }
}
"#;

pub const REPORT_SET_WINNER_ONLY: &str = r#"
mutation ReportBracketSet($setId: ID!, $winnerId: ID!) {
  reportBracketSet(setId: $setId, winnerId: $winnerId) { id state }
}
"#;

pub const REPORT_SET_WITH_GAMES: &str = r#"
mutation ReportBracketSet(
  $setId: ID!
  $winnerId: ID!
  $gameData: [BracketSetGameDataInput]
) {
  reportBracketSet(setId: $setId, winnerId: $winnerId, gameData: $gameData) { id state }
}
"#;

const SET_FIELDS: &str = r#"
  pageInfo { total totalPages }
  nodes {
    id
    displayScore
    fullRoundText
    phaseGroup {
      id
      displayIdentifier
      phase { id name }
    }
    state
    station { id number }
    slots {
      id
      entrant {
        id
        name
        participants { id gamerTag prefix }
      }
      standing { stats { score { value } } }
    }
  }
"#;

pub fn sets(scope: &str) -> Option<String> {
    let query = match scope {
        "event" => format!(r#"
query EventSets($eventId: ID!, $page: Int!, $perPage: Int!) {{
  event(id: $eventId) {{
    sets(page: $page, perPage: $perPage, sortType: STANDARD) {{
      {SET_FIELDS}
    }}
  }}
}}
"#),
        "phase" => format!(r#"
query PhaseSets($phaseId: ID!, $page: Int!, $perPage: Int!) {{
  phase(id: $phaseId) {{
    sets(page: $page, perPage: $perPage, sortType: STANDARD) {{
      {SET_FIELDS}
    }}
  }}
}}
"#),
        "phaseGroup" => format!(r#"
query PhaseGroupSets($phaseGroupId: ID!, $page: Int!, $perPage: Int!) {{
  phaseGroup(id: $phaseGroupId) {{
    sets(page: $page, perPage: $perPage, sortType: STANDARD) {{
      {SET_FIELDS}
    }}
  }}
}}
"#),
        "station" => format!(r#"
query StationSets($eventId: ID!, $stationNumbers: [Int], $page: Int!, $perPage: Int!) {{
  event(id: $eventId) {{
    sets(
      page: $page
      perPage: $perPage
      sortType: STANDARD
      filters: {{ stationNumbers: $stationNumbers }}
    ) {{
      {SET_FIELDS}
    }}
  }}
}}
"#),
        _ => return None,
    };
    Some(query)
}
