export const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

export const shortDate = (value: string) =>
  new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to open the local database.';
