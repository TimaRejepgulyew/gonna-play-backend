/**
 * Единое правило нормализации почты для всего приложения: нижний регистр без
 * крайних пробелов. Живёт в общем низу, а не в `@/auth/**`, потому что им
 * пользуются обе половины среза — провайдерская и парольная, — а модулю
 * пользователя нельзя тянуть доменный модуль авторизации.
 *
 * Записывать и искать надо одинаково: уникальный индекс `users.email` в Postgres
 * регистрозависим, и `Keeper@Example.com` с `keeper@example.com` он считает
 * разными адресами. Без общего правила вход через провайдера не нашёл бы
 * владельца, заведённого паролем, и завёл бы человеку второй аккаунт.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}

/**
 * То же правило для полей запроса на обновление, где `undefined` значит «поле не
 * трогаем»: превращать его в `null` нельзя — это стёрло бы почту в базе.
 */
export function normalizeEmailPatch(email: string | null | undefined): string | null | undefined {
  return email === undefined ? undefined : normalizeEmail(email);
}
