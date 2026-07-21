export enum PLAYER_POSITION {
  Goalkeeper = "GOALKEEPER",
  Defender = "DEFENDER",
  Midfielder = "MIDFIELDER",
  Forward = "FORWARD",
}

export enum PLAYER_LEVEL {
  Junior = "JUNIOR",
  Middle = "MIDDLE",
  Senior = "SENIOR",
  Legend = "LEGEND",
}

export const PLAYER_LEVEL_ORDER: PLAYER_LEVEL[] = [
  PLAYER_LEVEL.Junior,
  PLAYER_LEVEL.Middle,
  PLAYER_LEVEL.Senior,
  PLAYER_LEVEL.Legend,
];
