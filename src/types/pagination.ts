import { type TSchema, Type } from "typebox";

export const paginationQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  sort: Type.Optional(Type.String()),
  order: Type.Optional(
    Type.Union([Type.Literal("asc"), Type.Literal("desc")], { default: "desc" }),
  ),
});

// Factory for the unified list-response envelope.
export const paginatedResponse = <T extends TSchema>(item: T) =>
  Type.Object({
    data: Type.Array(item),
    meta: Type.Object({
      page: Type.Integer(),
      limit: Type.Integer(),
      total: Type.Integer(),
      totalPages: Type.Integer(),
    }),
  });

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ResolvedPagination {
  skip: number;
  take: number;
  page: number;
  limit: number;
  orderBy: Record<string, "asc" | "desc">;
}

// Translates page/limit into Prisma skip/take and sort/order into orderBy.
// `allowedSort` is a whitelist guarding against sorting on arbitrary columns.
export function resolvePagination(
  query: PaginationQuery,
  allowedSort: string[],
  defaultSort: string,
  defaultOrder: "asc" | "desc" = "desc",
): ResolvedPagination {
  const page = query.page && query.page > 0 ? query.page : 1;
  const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
  const sortField = query.sort && allowedSort.includes(query.sort) ? query.sort : defaultSort;
  const order = query.order === "asc" ? "asc" : query.order === "desc" ? "desc" : defaultOrder;

  return {
    skip: (page - 1) * limit,
    take: limit,
    page,
    limit,
    orderBy: { [sortField]: order },
  };
}

export function buildMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
