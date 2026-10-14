// 16 levels across five locations. `crowd` = civilians spawned, `look` = lookalikes copying
// part of the mark's outfit, `target0` = how many people should still fit after the briefing,
// `behave` = how much the later intel leans on behaviour you must observe.
export const LEVELS = [
  { name: 'Morning Market', venue: 'market', tod: 'morning', crowd: 60, look: 4, target0: 6, intel: 2, behave: 0.3, time: 180, events: [] },
  { name: 'Platform Nine', venue: 'station', tod: 'noon', crowd: 66, look: 5, target0: 7, intel: 2, behave: 0.35, time: 180, events: ['siren'] },
  { name: 'Harbour Dawn', venue: 'harbour', tod: 'morning', crowd: 70, look: 5, target0: 8, intel: 3, behave: 0.4, time: 190, events: ['parcel'] },
  { name: 'Summer Festival', venue: 'festival', tod: 'noon', crowd: 80, look: 6, target0: 9, intel: 3, behave: 0.4, time: 190, events: ['siren'] },
  { name: 'Sky Terrace', venue: 'party', tod: 'dusk', crowd: 60, look: 6, target0: 9, intel: 3, behave: 0.45, time: 190, events: ['swap'] },
  { name: 'Lunch Rush', venue: 'market', tod: 'noon', crowd: 88, look: 7, target0: 10, intel: 3, behave: 0.5, time: 200, events: ['parcel', 'siren'] },
  { name: 'Evening Commute', venue: 'station', tod: 'dusk', crowd: 95, look: 8, target0: 11, intel: 3, behave: 0.5, time: 200, events: ['swap'] },
  { name: 'Fog on the Quay', venue: 'harbour', tod: 'fog', crowd: 90, look: 8, target0: 11, intel: 3, behave: 0.55, time: 200, events: ['siren'] },
  { name: 'Lantern Night', venue: 'festival', tod: 'night', crowd: 105, look: 9, target0: 12, intel: 4, behave: 0.55, time: 210, events: ['parcel'] },
  { name: 'Penthouse Party', venue: 'party', tod: 'night', crowd: 75, look: 9, target0: 12, intel: 4, behave: 0.6, time: 210, events: ['siren', 'swap'] },
  { name: 'Market in the Rain', venue: 'market', tod: 'rain', crowd: 105, look: 10, target0: 13, intel: 4, behave: 0.6, time: 210, events: ['swap'] },
  { name: 'Last Train', venue: 'station', tod: 'night', crowd: 115, look: 11, target0: 14, intel: 4, behave: 0.65, time: 220, events: ['parcel', 'siren'] },
  { name: 'Storm Harbour', venue: 'harbour', tod: 'rain', crowd: 115, look: 11, target0: 14, intel: 4, behave: 0.65, time: 220, events: ['swap', 'parcel'] },
  { name: 'Festival Finale', venue: 'festival', tod: 'dusk', crowd: 130, look: 12, target0: 15, intel: 4, behave: 0.7, time: 230, events: ['siren', 'parcel'] },
  { name: 'Rooftop Gala', venue: 'party', tod: 'night', crowd: 90, look: 12, target0: 15, intel: 4, behave: 0.75, time: 230, events: ['swap', 'siren'] },
  { name: 'The Grand Bazaar', venue: 'market', tod: 'dusk', crowd: 150, look: 14, target0: 18, intel: 5, behave: 0.8, time: 240, events: ['parcel', 'swap', 'siren'] },
];

export const VENUE_NAMES = { market: 'Market Square', station: 'Central Station', harbour: 'Old Harbour', festival: 'Riverside Festival', party: 'Sky Terrace' };
