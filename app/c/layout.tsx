'use client';

import { Dashboard } from '@/components/ui/dashboard';
import { PentestGPTContext } from '@/context/context';
import { useUIContext } from '@/context/ui-context';
import { getChatsByUserId } from '@/db/chats';
import { getSubscriptionByUserId } from '@/db/subscriptions';
import { LargeModel, SmallModel } from '@/lib/models/hackerai-llm-list';
import { useRouter } from 'next/navigation';
import { type ReactNode, useContext, useEffect, useState } from 'react';
import Loading from '../loading';
import { getChatFilesByChatId } from '@/db/chat-files';
import { getMessagesByChatId } from '@/db/messages';
import { db } from '@/db/local/db';
import PQueue from 'p-queue';

interface WorkspaceLayoutProps {
  children: ReactNode;
}

const fetchWorkspaceData = async (
  userId: string,
  setChats: (chats: any[]) => void,
) => {
  try {
    const chats = await getChatsByUserId(userId, false);
    const queue = new PQueue({ concurrency: 10 });
    await db.storage.clean(
      userId,
      chats.map((chat) => chat.id),
    );

    chats.map((chat) =>
      queue.add(async () => {
        const messages = await getMessagesByChatId(
          chat.id,
          9999, // Fetch all messages
          undefined,
          false,
        );
        const chatFiles = await getChatFilesByChatId(chat.id, false);
        db.storage.create(chat, messages, chatFiles);
      }),
    );
    setChats(chats);

    await queue.onIdle();
    return true;
  } catch (error) {
    console.error('Error fetching workspace data:', error);
    return false;
  }
};

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Destructure all context values in a single statement
  const {
    setChatSettings,
    setChats,
    setSelectedChat,
    setChatMessages,
    setUserInput,
    setChatFiles,
    setChatImages,
    setNewMessageFiles,
    setNewMessageImages,
    user,
  } = useContext(PentestGPTContext);

  const { setIsGenerating, setFirstTokenReceived } = useUIContext();

  useEffect(() => {
    const initializeWorkspace = async () => {
      try {
        if (!user) {
          router.push('/login');
          return;
        }

        // Get subscription and set model
        const subscription = await getSubscriptionByUserId(user.id);
        const modelId =
          subscription?.status === 'active'
            ? LargeModel.modelId
            : SmallModel.modelId;

        setChatSettings({
          model: modelId,
        });

        // Reset all chat-specific states
        setSelectedChat(null);
        setChatMessages([]);
        setUserInput('');
        setChatFiles([]);
        setChatImages([]);
        setNewMessageFiles([]);
        setNewMessageImages([]);
        setIsGenerating(false);
        setFirstTokenReceived(false);

        // Fetch workspace data
        const success = await fetchWorkspaceData(user.id, setChats);
        if (!success) {
          router.push('/');
          return;
        }
      } catch (error) {
        console.error('Workspace initialization error:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    initializeWorkspace();
  }, [router]); // Only depend on router

  if (loading) {
    return <Loading />;
  }

  return <Dashboard>{children}</Dashboard>;
}
