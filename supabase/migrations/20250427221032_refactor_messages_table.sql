-- First, add new columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachments') THEN
        ALTER TABLE messages ADD COLUMN attachments JSONB[];
    END IF;
END $$;


-- Add constraints if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'messages' AND constraint_name = 'check_attachments_length') THEN
        ALTER TABLE messages ADD CONSTRAINT check_attachments_length CHECK (array_length(attachments, 1) <= 10);
    END IF;
END $$;

-- Add indexes if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'idx_messages_attachments') THEN
        CREATE INDEX idx_messages_attachments ON messages USING GIN (attachments);
    END IF;
END $$;

-- Drop old columns if they exist
-- DO $$ 
-- BEGIN
    -- IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'rag_used') THEN
    --     ALTER TABLE messages DROP COLUMN rag_used;
    -- END IF;
    
    -- IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'rag_id') THEN
    --     ALTER TABLE messages DROP COLUMN rag_id;
    -- END IF;
    
    -- IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'fragment') THEN
    --     ALTER TABLE messages DROP COLUMN fragment;
    -- END IF;
-- END $$;

-- Update RLS policies to include new columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Allow view access to attachments for non-private chats') THEN
        CREATE POLICY "Allow view access to attachments for non-private chats"
            ON messages
            FOR SELECT
            USING (chat_id IN (
                SELECT id FROM chats WHERE sharing <> 'private'
            ));
    END IF;
END $$; 