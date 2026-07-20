import fp from "fastify-plugin";
import swagger from "@fastify/swagger";

// OpenAPI generation (решение Р6): the spec is produced from the live route
// schemas by @fastify/swagger and served at /docs/json; the Postman collection
// is generated from it, never maintained by hand. Registered before
// configureRoutes so every route lands in the spec.
const swaggerPlugin = fp(async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Gonna Play API",
        description: "Backend for the gonna-play football match app",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  fastify.get("/docs/json", { schema: { hide: true } }, async () =>
    fastify.swagger()
  );
});

export default swaggerPlugin;
