import { Prisma } from "@prisma/client";

export enum PLAYER_POSITION {
  Goalkeeper = "Goalkeeper",
  Defender = "Defender",
  Midfielder = "Midfielder",
  Forward = "Forward",
}

export enum PLAYER_LEVEL {
  Junior = "Junior",
  Middle = "Middle",
  Senior = "Senior",
  Legend = "Legend",
}
