// One home for every category. Navigation and category pages share this copy.
export const WORLDS = [
  {id:'arcade',name:'Arcade',cat:'Arcade',href:'/free-arcade-games/',hook:'One more go?',intro:'Stack it, dodge it, send it flying. This is where a quick game turns into five more',color:'#e7b95e'},
  {id:'driving',name:'Driving',cat:'Driving',href:'/free-racing-games/',hook:'Probably brake here',intro:'Clean racing lines or a spectacular crash. We have room for both',color:'#75c9e7'},
  {id:'sport',name:'Sport',cat:'Sport',href:'/free-sports-games/',hook:'Make the highlight reel',intro:'Last-second shots, wild swings and a rematch you definitely meant to win',color:'#f09670'},
  {id:'action',name:'Action',cat:'Action',href:'/free-action-games/',hook:'Jump in swinging',intro:'Punch through the problem. Or jump over it. The floor is rarely the safest option',color:'#e97d9c'},
  {id:'shooter',name:'Shooter',cat:'Shooter',href:'/free-shooting-games/',hook:'Nice shot. Again?',intro:'Find your aim in rooftop duels, tiny battlefields and some very angry eggs',color:'#a6c675'},
  {id:'adventure',name:'Adventure',cat:'Adventure',href:'/free-adventure-games/',hook:'Take the weird path',intro:'There is probably treasure over there. There is almost definitely trouble',color:'#c5a2ed'},
  {id:'puzzle',name:'Puzzle',cat:'Puzzle',href:'/free-puzzle-games/',hook:'Hang on, I can solve this',intro:'A little thinking, a few wrong turns, then that lovely moment when it clicks',color:'#78cdbb'},
  {id:'strategy',name:'Strategy',cat:'Strategy',href:'/free-strategy-games/',hook:'A plan would help',intro:'Build a team, guard your turf and try to look like this was the plan all along',color:'#c5ba73'},
  {id:'horror',name:'Horror',cat:'Horror',href:'/free-horror-games/',hook:'Did that just move?',intro:'Dark corners and very bad company. Maybe leave a light on',color:'#b6a1d5'},
  {id:'new',name:'New',href:'/browse/new/',hook:'Fresh out of the workshop',intro:'The latest additions to the pile. Pick one up and see what it does',color:'#90c996'},
  {id:'popular',name:'Popular picks',href:'/browse/popular/',hook:'Can’t pick? Start here',intro:'A starting lineup of quick fixes and bigger adventures. Something here should grab you',note:'Featured selection',color:'#ebbd67'},
  {id:'friends',name:'Play with friends',cat:'Multiplayer',href:'/free-multiplayer-games/',hook:'Settle it with a rematch',intro:'Bring a friend. Share a screen or meet online, depending on the game',color:'#96b8ef'}
];
export const worldFor = value => WORLDS.find(w=>w.id===String(value).toLowerCase()||w.cat===value) || WORLDS[0];
export const FEATURED = ['air-hockey','penguin-dash','kart-clash','tiny-knight','stack','sushi-conveyor','inkvale','sky-aces','grapple-goblin','mini-golf','blade-dash-story','lukes-diner'];
export function newest(games) { return games.filter(g=>g.added).sort((a,b)=>b.added.localeCompare(a.added)).slice(0,12); }
export function featured(games) { return FEATURED.map(slug=>games.find(g=>g.slug===slug)).filter(Boolean); }
