/**
 * Seed data for the prototype.
 *
 * This is the only file that invents people and places. Everything downstream
 * reads through the data layer, so swapping these fixtures for a real backend
 * means changing which repository the app is built with — not touching a screen.
 *
 * Field values that a server would compute are noted where they appear:
 * `distanceLabel`, `status`, `visibility`, and `passerNote` are all resolved
 * against the viewer, and every `time` string is pre-formatted for display.
 */

import type {
  CurrentUser,
  Friend,
  FriendRequest,
  Haunt,
  Keepsake,
  Notification,
} from '../domain'

export const seedUser: CurrentUser = {
  handle: '@you',
  hauntsDropped: 7,
  hauntsVisited: 14,
  hauntsPassedOn: 11,
  vibes: ['quiet', 'nature', 'hidden'],
  memberSince: 'October 2024',
}

export const seedFriends: Friend[] = [
  { handle: '@maya', vibes: ['hidden', 'weird', 'historic'], mutualCount: 3 },
  { handle: '@jordan', vibes: ['view', 'late night', 'food'], mutualCount: 2 },
  { handle: '@elisha', vibes: ['quiet', 'nature', 'seasonal'], mutualCount: 4 },
  { handle: '@sam.w', vibes: ['weird', 'effort'], mutualCount: 1 },
  { handle: '@riverway', vibes: ['water', 'quiet'], mutualCount: 2 },
]

export const seedKeepsakes: Keepsake[] = [
  {
    id: 'keepsake-rooftop-5th',
    hauntId: 'rooftop-5th',
    name: 'rooftop on 5th',
    finderHandle: '@jordan',
    collectedAt: 'January 2025',
    photoGradient: 'linear-gradient(150deg,#3c3a43,#111114)',
  },
  {
    id: 'keepsake-old-greenhouse',
    hauntId: 'old-greenhouse',
    name: 'the old greenhouse',
    finderHandle: '@elisha',
    collectedAt: 'November 2024',
    photoGradient: 'linear-gradient(150deg,#3b433d,#111312)',
  },
]

export const seedHaunts: Haunt[] = [
  {
    id: 'moss-steps',
    name: 'the moss steps',
    finderHandle: '@maya',
    passedByHandle: '@jordan',
    vibeTags: ['quiet', 'nature'],
    bestTimeTags: ['morning', 'autumn'],
    story:
      'A staircase behind the old reservoir that nobody uses anymore. When the fog comes in off the water the whole thing goes soft and green. I found it by getting lost. Go slowly.',
    arrivalNote: "You made it. Don't rush. Sit on the third step.",
    arrivalNoteKind: 'text',
    passerNote: 'you need to go here on a foggy day, trust me',
    status: 'locked',
    visibility: 'friend',
    audience: 'circle',
    lifespan: 'lasting',
    retired: false,
    zone: { x: 30, y: 26, radiusM: 200 },
    shroudTemperament: 2,
    photoGradient: 'linear-gradient(150deg,#3d4340,#111214)',
    photoUrls: [],
    visitorCount: 3,
    distanceLabel: '1.2 km',
    residues: [],
    founders: ['@maya'],
    health: { score: 82, velocity: 88, networkDistance: 76, conversion: 74 },
    lineage: [
      { handle: '@maya', role: 'finder', action: 'found this place', time: 'oct 2024' },
      { handle: '@jordan', role: 'visitor', action: 'made it here', time: 'nov 2024' },
      {
        handle: '@jordan',
        role: 'passer',
        action: 'passed it to you',
        time: '2 days ago',
        note: 'you need to go here on a foggy day, trust me',
      },
    ],
  },
  {
    id: 'rooftop-5th',
    name: 'rooftop on 5th',
    finderHandle: '@jordan',
    vibeTags: ['view', 'late night'],
    bestTimeTags: ['night', 'summer'],
    story:
      "The fire escape is technically a public right of way. Nobody knows this. From the top you can see the whole east side lit up and it's completely silent.",
    arrivalNote: 'Look south first. Then sit down before you take a photo.',
    arrivalNoteKind: 'text',
    passerNote: null,
    status: 'visited',
    visibility: 'friend',
    audience: 'circle',
    lifespan: 'lasting',
    retired: false,
    zone: { x: 68, y: 38, radiusM: 150 },
    shroudTemperament: 3,
    photoGradient: 'linear-gradient(150deg,#3c3a43,#111114)',
    photoUrls: [],
    visitorCount: 5,
    distanceLabel: '2.8 km',
    residues: [],
    founders: ['@jordan'],
    health: { score: 66, velocity: 58, networkDistance: 70, conversion: 78 },
    lineage: [
      { handle: '@jordan', role: 'finder', action: 'found this place', time: 'sep 2024' },
      { handle: '@you', role: 'you', action: 'made it here', time: 'jan 2025' },
      { handle: '@sam.w', role: 'visitor', action: 'made it here', time: 'mar 2025' },
    ],
  },
  {
    id: 'underpass',
    name: 'the underpass',
    finderHandle: '@maya',
    vibeTags: ['weird', 'historic'],
    bestTimeTags: ['afternoon'],
    story:
      'Someone has been repainting the same mural under here since the nineties. Layers and layers of it. If you look at the east wall you can see every era peeling through.',
    arrivalNote: 'Touch the east wall. Count the layers.',
    arrivalNoteKind: 'text',
    passerNote: null,
    status: 'locked',
    visibility: 'friend',
    audience: 'circle',
    lifespan: 'lasting',
    retired: false,
    zone: { x: 48, y: 62, radiusM: 250 },
    shroudTemperament: 2,
    photoGradient: 'linear-gradient(150deg,#433d39,#121112)',
    photoUrls: [],
    visitorCount: 2,
    distanceLabel: '3.4 km',
    residues: [],
    founders: ['@maya'],
    health: { score: 90, velocity: 95, networkDistance: 85, conversion: 84 },
    lineage: [
      { handle: '@maya', role: 'finder', action: 'found this place', time: 'dec 2024' },
      { handle: '@maya', role: 'passer', action: 'passed it to you', time: 'last week' },
    ],
  },
  {
    // A friend-of-a-friend haunt: the viewer can see that something is there
    // and nothing else. Its blank fields are what the server would actually
    // send — never real values the client is trusted to hide.
    id: 'fof-mystery',
    name: '???',
    finderHandle: '???',
    vibeTags: [],
    bestTimeTags: [],
    story: '',
    arrivalNote: '',
    arrivalNoteKind: null,
    passerNote: null,
    status: 'locked',
    visibility: 'fof',
    audience: 'circle',
    lifespan: 'lasting',
    retired: false,
    zone: { x: 80, y: 70, radiusM: 300 },
    shroudTemperament: 1,
    photoGradient: 'linear-gradient(150deg,#373338,#101012)',
    photoUrls: [],
    visitorCount: 0,
    distanceLabel: '4.1 km',
    residues: [],
    founders: ['???'],
    health: { score: 40, velocity: 42, networkDistance: 38, conversion: 38 },
    lineage: [],
  },
  {
    id: 'riverbend',
    name: 'riverbend',
    finderHandle: '@riverway',
    vibeTags: ['water', 'quiet'],
    bestTimeTags: ['evening', 'spring'],
    story:
      'Where the river turns there is a flat rock big enough for two people. The current sounds different here — lower, slower. I come here when my head is loud.',
    arrivalNote: 'Take your shoes off. The rock holds the afternoon heat.',
    arrivalNoteKind: 'text',
    passerNote: 'this one is for slow evenings',
    status: 'locked',
    visibility: 'friend',
    audience: 'circle',
    lifespan: 'lasting',
    retired: false,
    zone: { x: 16, y: 58, radiusM: 180 },
    shroudTemperament: 0,
    photoGradient: 'linear-gradient(150deg,#344044,#101214)',
    photoUrls: [],
    visitorCount: 4,
    distanceLabel: '5.6 km',
    residues: [],
    founders: ['@riverway'],
    health: { score: 74, velocity: 76, networkDistance: 72, conversion: 72 },
    lineage: [
      { handle: '@riverway', role: 'finder', action: 'found this place', time: 'aug 2024' },
      {
        handle: '@riverway',
        role: 'passer',
        action: 'passed it to you',
        time: 'yesterday',
        note: 'this one is for slow evenings',
      },
    ],
  },
  {
    id: 'old-greenhouse',
    name: 'the old greenhouse',
    finderHandle: '@elisha',
    vibeTags: ['nature', 'seasonal'],
    bestTimeTags: ['winter', 'morning'],
    story:
      'The botanic society abandoned it but the plants did not get the memo. In winter the glass fogs up from the inside and the whole structure breathes.',
    arrivalNote: 'The door sticks. Push, don’t pull. Mind the ferns.',
    arrivalNoteKind: 'text',
    passerNote: null,
    status: 'visited',
    visibility: 'friend',
    audience: 'circle',
    lifespan: 'lasting',
    retired: false,
    zone: { x: 58, y: 16, radiusM: 220 },
    shroudTemperament: 3,
    photoGradient: 'linear-gradient(150deg,#3b433d,#111312)',
    photoUrls: [],
    visitorCount: 6,
    distanceLabel: '6.9 km',
    residues: [],
    founders: ['@elisha', '@you', '@sam.w'],
    health: { score: 58, velocity: 44, networkDistance: 74, conversion: 69 },
    lineage: [
      {
        handle: '@elisha',
        role: 'finder',
        action: 'founded together',
        time: 'nov 2024',
        note: 'we almost walked past it',
      },
      { handle: '@you', role: 'you', action: 'founded together', time: 'nov 2024' },
      { handle: '@sam.w', role: 'visitor', action: 'founded together', time: 'nov 2024' },
      { handle: '@riverway', role: 'visitor', action: 'made it here', time: 'feb 2025' },
    ],
  },
]

export const seedNotifications: Notification[] = [
  {
    id: 'n1',
    kind: 'visit',
    text: '@jordan made it to the moss steps',
    time: '2h ago',
    hauntId: 'moss-steps',
    actorHandle: '@jordan',
  },
  {
    id: 'n2',
    kind: 'pass',
    text: '@maya passed you somewhere worth knowing about',
    time: 'yesterday',
    hauntId: 'underpass',
    actorHandle: '@maya',
  },
  {
    id: 'n3',
    kind: 'anon',
    text: 'someone new made it to rooftop on 5th',
    time: '3d ago',
    hauntId: 'rooftop-5th',
    actorHandle: null,
  },
]

/** The requests the prototype opens with: one waiting on you, one on them. */
export const seedFriendRequests: FriendRequest[] = [
  { handle: '@ada.grey', direction: 'incoming' },
  { handle: '@theo.vance', direction: 'outgoing' },
]

/** The haunt the prototype pretends you walked past without logging. */
export const seedMissedVisitId = 'riverbend'
