import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LocationService } from '../services/locationService';

// Validation schemas
const createLocationSchema = z.object({
  name: z.string().min(3),
  address: z.string().min(5),
  city: z.string().min(2),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const updateLocationSchema = z.object({
  name: z.string().min(3).optional(),
  address: z.string().min(5).optional(),
  city: z.string().min(2).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

interface LocationParams {
  id: number;
}

interface SearchQuerystring {
  term: string;
  limit?: number;
}

interface ListQuerystring {
  city?: string;
  limit?: number;
  offset?: number;
}

const locationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const locationService = new LocationService(fastify.pg);

  // Create a new location
  fastify.post<{ Body: z.infer<typeof createLocationSchema> }>(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['name', 'address', 'city'],
          properties: {
            name: { type: 'string', minLength: 3 },
            address: { type: 'string', minLength: 5 },
            city: { type: 'string', minLength: 2 },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              address: { type: 'string' },
              city: { type: 'string' },
              latitude: { type: 'number' },
              longitude: { type: 'number' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const validatedData = createLocationSchema.parse(request.body);
        const location = await locationService.createLocation({
          name: validatedData.name,
          address: validatedData.address,
          city: validatedData.city,
          latitude: validatedData.latitude,
          longitude: validatedData.longitude,
        });

        reply.status(201).send(location);
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
          message: 'An error occurred while creating the location',
        });
      }
    }
  );

  // Get a location by ID
  fastify.get<{ Params: LocationParams }>(
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
              name: { type: 'string' },
              address: { type: 'string' },
              city: { type: 'string' },
              latitude: { type: 'number' },
              longitude: { type: 'number' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const location = await locationService.findLocationById(id);

        if (!location) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Location not found',
          });
        }

        reply.send(location);
      } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while fetching the location',
        });
      }
    }
  );

  // Update a location
  fastify.put<{ Params: LocationParams; Body: z.infer<typeof updateLocationSchema> }>(
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
            name: { type: 'string', minLength: 3 },
            address: { type: 'string', minLength: 5 },
            city: { type: 'string', minLength: 2 },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              address: { type: 'string' },
              city: { type: 'string' },
              latitude: { type: 'number' },
              longitude: { type: 'number' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const validatedData = updateLocationSchema.parse(request.body);

        const location = await locationService.updateLocation(id, validatedData);

        if (!location) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Location not found',
          });
        }

        reply.send(location);
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
          message: 'An error occurred while updating the location',
        });
      }
    }
  );

  // List locations
  fastify.get<{ Querystring: ListQuerystring }>(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            city: { type: 'string' },
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
                name: { type: 'string' },
                address: { type: 'string' },
                city: { type: 'string' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { city, limit = 20, offset = 0 } = request.query;
        const locations = await locationService.listLocations(city, limit, offset);

        reply.send(locations);
      } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while fetching locations',
        });
      }
    }
  );

  // Search locations
  fastify.get<{ Querystring: SearchQuerystring }>(
    '/search',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['term'],
          properties: {
            term: { type: 'string', minLength: 2 },
            limit: { type: 'number' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                address: { type: 'string' },
                city: { type: 'string' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { term, limit = 20 } = request.query;
        const locations = await locationService.searchLocations(term, limit);

        reply.send(locations);
      } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while searching locations',
        });
      }
    }
  );

  // Delete a location
  fastify.delete<{ Params: LocationParams }>(
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
        const deleted = await locationService.deleteLocation(id);

        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Location not found',
          });
        }

        reply.status(204).send();
      } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while deleting the location',
        });
      }
    }
  );
};

export default locationRoutes;
