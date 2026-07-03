const gameAbbreviations: Record<string, string> = {
  // hoyoverse
  "Genshin Impact": "GI",
  "Honkai: Star Rail": "HSR",
  "Honkai Impact 3rd": "HI3",
  "Zenless Zone Zero": "ZZZ",

  // kuro games
  "Wuthering Waves": "WuWa",

  // shift up
  "Goddess of Victory: Nikke": "NIKKE",
  "Goddess Of Victory: Nikke": "NIKKE",
  "GODDESS OF VICTORY: NIKKE": "NIKKE",
  "Nikke: Goddess of Victory": "NIKKE",

  // other popular games
  Arknights: "AK",
  "Blue Archive": "BA",
  "Azur Lane": "AL",
  "Girls' Frontline": "GFL",
  "Punishing: Gray Raven": "PGR",
  "Reverse: 1999": "R1999",
  "Tower of Fantasy": "ToF",
  "Fate/Grand Order": "FGO",
  "Granblue Fantasy": "GBF",
  "Princess Connect! Re:Dive": "Priconne",
  "Uma Musume": "Uma",
  "The Legend of Zelda": "Zelda",
  "Final Fantasy XIV": "FFXIV",
  "Final Fantasy VII": "FF7",
  "Elden Ring": "ER",
  "NieR: Automata": "NieR",
  "Persona 5": "P5",
};

export function getGameAbbreviation(gameName: string): string {
  return gameAbbreviations[gameName] ?? gameName;
}
