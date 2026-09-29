export type Video = {
  id: string;
  title: string;
  channel: string;
  channelId?: string;
  thumb: string;
  views?: string;
  published?: string;
  duration?: string;
  description?: string;
};

export type GoogleUser = {
  name: string;
  email: string;
  picture?: string;
};
