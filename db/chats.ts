import { supabase } from '@/lib/supabase/browser-client';
import type { TablesInsert, TablesUpdate } from '@/supabase/types';
import {
  deleteAllStoredChats,
  deleteStoredChat,
  getStoredChatById,
  getStoredChatsByUserId,
  updateStoredChat,
  updateStoredChats,
} from './local/db';

export const getChatById = async (chatId: string) => {
  const storedChat = await getStoredChatById(chatId);
  if (storedChat) {
    return storedChat;
  }

  const { data: chat } = await supabase
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .maybeSingle();

  return chat;
};

export const createChat = async (chat: TablesInsert<'chats'>) => {
  const { data: createdChat, error } = await supabase
    .from('chats')
    .insert([chat])
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await updateStoredChat(createdChat);

  return createdChat;
};

export const updateChat = async (
  chatId: string,
  chat: TablesUpdate<'chats'>,
) => {
  const { data: updatedChat, error } = await supabase
    .from('chats')
    .update(chat)
    .eq('id', chatId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await updateStoredChat(updatedChat);

  return updatedChat;
};

export const deleteChat = async (chatId: string) => {
  const { error } = await supabase.from('chats').delete().eq('id', chatId);

  if (error) {
    throw new Error(error.message);
  }

  await deleteStoredChat(chatId);

  return true;
};

export const deleteAllChats = async (userId: string) => {
  const { error: chatDeleteError } = await supabase
    .from('chats')
    .delete()
    .eq('user_id', userId);

  if (chatDeleteError) {
    throw new Error(chatDeleteError.message);
  }

  await deleteAllStoredChats(userId);

  return true;
};

export const getChatsByUserId = async (userId: string) => {
  const storedChats = await getStoredChatsByUserId(userId);
  if (storedChats) {
    return storedChats;
  }

  const { data: chats, error } = await supabase
    .from('chats')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  return chats;
};

export const getMoreChatsByUserId = async (
  userId: string,
  lastChatCreatedAt: string,
) => {
  const { data: chats, error } = await supabase
    .from('chats')
    .select('*')
    .eq('user_id', userId)
    .lt('created_at', lastChatCreatedAt)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  await updateStoredChats(chats);

  return chats;
};
