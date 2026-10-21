export type NoticeTone = 'error' | 'warning' | 'success' | 'info';
export type NoticeSink = (message: string | undefined, tone: NoticeTone) => void;

export const noticeLabels = {
  error: 'actionFailed',
  warning: 'checkThis',
  success: 'done',
  info: 'notice'
} as const;
