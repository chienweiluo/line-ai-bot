import { messagingApi } from "@line/bot-sdk";
import { saveProfile, getProfile } from "./db.js";

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getDisplayName(event) {
  const userId = event.source.userId;
  if (!userId) return null;

  const cached = getProfile(userId);
  if (cached && Date.now() - cached.updatedAt < TTL_MS) {
    return cached.displayName;
  }

  try {
    let profile;
    const src = event.source;
    if (src.type === "group") {
      profile = await lineClient.getGroupMemberProfile(src.groupId, userId);
    } else if (src.type === "room") {
      profile = await lineClient.getRoomMemberProfile(src.roomId, userId);
    } else {
      profile = await lineClient.getProfile(userId);
    }
    if (profile?.displayName) {
      saveProfile(userId, profile.displayName);
      return profile.displayName;
    }
  } catch (err) {
    console.warn(`[profile] failed to fetch ${userId}:`, err.message);
  }
  return cached?.displayName ?? null;
}
