import { CreatePlayer, PlayerService, UpdatePlayer } from "./player.service.js";

export class PlayerController {
  private playerService: PlayerService;
  constructor() {
    this.playerService = new PlayerService();
  }

  getPlayerList() {
    return this.playerService.getPlayerList();
  }

  createPlayer(req: { body: CreatePlayer }) {
    return this.playerService.createPlayer(req.body);
  }

  getPlayer(req: { params: { id: string } }) {
    console.log(req.params.id);
    return this.playerService.getPlayer(Number(req.params.id));
  }

  updatePlayer(req: { body: UpdatePlayer; params: { id: string } }) {
    return this.playerService.updatePlayer(req.body);
  }

  async deletePlayer(req: { params: { id: string } }) {
    await this.playerService.deletePlayer(Number(req.params.id));

    return {
      status: "success",
      message: "Player deleted successfully",
    };
  }
}
