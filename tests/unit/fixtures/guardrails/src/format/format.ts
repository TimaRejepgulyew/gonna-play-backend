// Намеренно нарушенный формат: одинарные кавычки, отступ в 4 пробела, нет
// завершающих `;`. Импортов нет, чтобы диагностика форматтера не смешивалась с
// organizeImports.
export const FORMAT_PROBE = {
    label: 'guardrails',
    kind: 'format'
}

export function describeFormatProbe(): string {
    return `${FORMAT_PROBE.label}:${FORMAT_PROBE.kind}`
}
