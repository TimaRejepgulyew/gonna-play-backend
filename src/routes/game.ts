import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { GameService } from '../services/gameService';
import { GameStatus, SkillLevel } from '../types';

// Validation schemas
const createGameSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  start_time: z.string().transform((str) => new Date(str)),
  end_time: z.string().transform((str) => new Date(str)),
  location_id: z.number(),
  max_players: z.number().min(2).default(10),
  min_players: z.number().min(2).default(2),
  price: z.number().optional(),
  skill_level: z.enum(['beginner', 'intermediate', 'advanced', 'professional']).optional(),
});

const updateGameSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  start_time: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  end_time: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  location_id: z.number().optional(),
  max_players: z.number().min(2).optional(),
  min_players: z.number().min(2).optional(),
  status: z.enum(['open', 'full', 'in_progress', 'completed', 'cancelled']).optional(),
  price: z.number().optional(),
  skill_level: z.enum(['beginner', 'intermediate', 'advanced', 'professional']).optional(),
});

interface GameParams {
  id: number;
}

interface ListQuerystring {
  status?: GameStatus;
  location_id?: number;
  start_after?: string;
  start_before?: string;
  skill_level?: SkillLevel;
  created_by?: number;
  limit?: number;
  offset?: number;
}

const gameRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const gameService = new GameService(fastify.pg);

  // Create a new game
  fastify.post<{ Body: z.infer<typeof createGameSchema> }>(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['title', 'start_time', 'end_time', 'location_id'],
          properties: {
            title: { type: 'string', minLength: 3 },
            description: { type: 'string' },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            location_id: { type: 'number' },
            max_players: { type: 'number', minimum: 2 },
            min_players: { type: 'number', minimum: 2 },
            price: { type: 'number' },
            skill_level: {
              type: 'string',
              enum: ['beginner', 'intermediate', 'advanced', 'professional'],
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              created_by: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string' },
              start_time: { type: 'string', format: 'date-time' },
              end_time: { type: 'string', format: 'date-time' },
              location_id: { type: 'number' },
              max_players: { type: 'number' },
              min_players: { type: 'number' },
              status: { type: 'string' },
              price: { type: 'number' },
              skill_level: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = request.user.id;
        const validatedData = createGameSchema.parse(request.body);

        const game = await gameService.createGame({
          title: validatedData.title,
          description: validatedData.description,
          start_time: validatedData.start_time,
          end_time: validatedData.end_time,
          location_id: validatedData.location_id,
          max_players: validatedData.max_players,
          min_players: validatedData.min_players,
          price: validatedData.price,
          skill_level: validatedData.skill_level,
          created_by: userId,
        });

        reply.status(201).send(game);
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.errors,
          });
          return;
        }

        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while creating the game',
        });
      }
    }
  );

  // Get a game by ID
  fastify.get<{ Params: GameParams }>(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'number' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              created_by: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string' },
              start_time: { type: 'string', format: 'date-time' },
              end_time: { type: 'string', format: 'date-time' },
              location_id: { type: 'number' },
              max_players: { type: 'number' },
              min_players: { type: 'number' },
              status: { type: 'string' },
              price: { type: 'number' },
              skill_level: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const game = await gameService.findGameById(id);

        if (!game) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Game not found',
          });
        }

        reply.send(game);
      } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while fetching the game',
        });
      }
    }
  );

  // Update a game
  fastify.put<{ Params: GameParams; Body: z.infer<typeof updateGameSchema> }>(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'number' },
          },
        },
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 3 },
            description: { type: 'string' },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            location_id: { type: 'number' },
            max_players: { type: 'number', minimum: 2 },
            min_players: { type: 'number', minimum: 2 },
            status: {
              type: 'string',
              enum: ['open', 'full', 'in_progress', 'completed', 'cancelled'],
            },
            price: { type: 'number' },
            skill_level: {
              type: 'string',
              enum: ['beginner', 'intermediate', 'advanced', 'professional'],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              created_by: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string' },
              start_time: { type: 'string', format: 'date-time' },
              end_time: { type: 'string', format: 'date-time' },
              location_id: { type: 'number' },
              max_players: { type: 'number' },
              min_players: { type: 'number' },
              status: { type: 'string' },
              price: { type: 'number' },
              skill_level: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const validatedData = updateGameSchema.parse(request.body);

        // Check if the user is the creator of the game
        const game = await gameService.findGameById(id);

        if (!game) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Game not found',
          });
        }

        if (game.created_by !== request.user.id) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You are not authorized to update this game',
          });
        }

        const updatedGame = await gameService.updateGame(id, validatedData);

        reply.send(updatedGame);
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.errors,
          });
          return;
        }

        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while updating the game',
        });
      }
    }
  );

  // List games
  fastify.get<{ Querystring: ListQuerystring }>(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['open', 'full', 'in_progress', 'completed', 'cancelled'],
            },
            location_id: { type: 'number' },
            start_after: { type: 'string', format: 'date-time' },
            start_before: { type: 'string', format: 'date-time' },
            skill_level: {
              type: 'string',
              enum: ['beginner', 'intermediate', 'advanced', 'professional'],
            },
            created_by: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                created_by: { type: 'number' },
                title: { type: 'string' },
                description: { type: 'string' },
                start_time: { type: 'string', format: 'date-time' },
                end_time: { type: 'string', format: 'date-time' },
                location_id: { type: 'number' },
                max_players: { type: 'number' },
                min_players: { type: 'number' },
                status: { type: 'string' },
                price: { type: 'number' },
                skill_level: { type: 'string' },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const {
          status,
          location_id,
          start_after,
          start_before,
          skill_level,
          created_by,
          limit = 20,
          offset = 0,
        } = request.query;

        const filters: any = {};

        if (status) filters.status = status;
        if (location_id) filters.location_id = location_id;
        if (start_after) filters.start_after = new Date(start_after);
        if (start_before) filters.start_before = new Date(start_before);
        if (skill_level) filters.skill_level = skill_level;
        if (created_by) filters.created_by = created_by;

        const games = await gameService.listGames(filters, limit, offset);

        reply.send(games);
      } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while fetching games',
        });
      }
    }
  );

  // Delete a game
  fastify.delete<{ Params: GameParams }>(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'number' },
          },
        },
        response: {
          204: {
            type: 'null',
            description: 'No content',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        // Check if the user is the creator of the game
        const game = await gameService.findGameById(id);

        if (!game) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Game not found',
          });
        }

        if (game.created_by !== request.user.id) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You are not authorized to delete this game',
          });
        }

        const deleted = await gameService.deleteGame(id);

        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Game not found',
          });
        }

        reply.status(204).send();
      } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while deleting the game',
        });
      }
    }
  );
};

export default gameRoutes;
