import { Message, type IMessage } from "../models/Message.model";
import { ApiError } from "../utils/ApiError";
import { events } from "../platform/events";
import { assertNotBlocked } from "./block.service";
import { assertParticipant } from "./conversation.service";
import type { SerializedMessage } from "../socket/types";

export interface SendMessageParams {
  conversationId: string;
  content: string;
  type?: "text" | "image";
}

// Mongoose's generic `.toJSON()` typing can't see through our custom
// transform (which strips _id/__v — see Message.model.ts), so it still
// types `id` as optional and senderId/receiverId/dates as ObjectId/Date.
// At runtime they *are* plain strings (Mongoose calls ObjectId#toJSON /
// Date#toJSON while serializing), so this is the one place that asserts it
// — every caller gets a properly-typed SerializedMessage back, no further
// casts needed.
function serialize(message: IMessage): SerializedMessage {
  return message.toJSON() as unknown as SerializedMessage;
}

export async function sendMessage(
  senderId: string,
  input: SendMessageParams,
): Promise<SerializedMessage> {
  const conversation = await assertParticipant(input.conversationId, senderId);

  const receiverId = conversation.participants.find((p) => p.toString() !== senderId);
  if (!receiverId) {
    throw ApiError.internal("Couldn't determine the message recipient");
  }
  await assertNotBlocked(senderId, receiverId.toString(), "You can't message this user.");

  const message = await Message.create({
    conversationId: conversation._id,
    senderId,
    receiverId,
    content: input.content,
    type: input.type ?? "text",
  });

  conversation.lastMessage = input.content;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  events.emit("message.sent", {
    messageId: message.id,
    conversationId: conversation.id,
    senderId,
    receiverId: receiverId.toString(),
    preview: input.content,
  });

  return serialize(message);
}

export async function markMessageRead(
  messageId: string,
  userId: string,
): Promise<SerializedMessage> {
  const message = await Message.findById(messageId);
  if (!message) {
    throw ApiError.notFound("Message not found");
  }
  if (message.receiverId.toString() !== userId) {
    throw ApiError.forbidden("You can only mark your own received messages as read");
  }

  if (!message.isRead) {
    message.isRead = true;
    await message.save();
  }

  return serialize(message);
}
