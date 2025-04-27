-- First, add new columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'reasoning') THEN
        ALTER TABLE messages ADD COLUMN reasoning TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'provider_metadata') THEN
        ALTER TABLE messages ADD COLUMN provider_metadata JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'model_params') THEN
        ALTER TABLE messages ADD COLUMN model_params JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachments') THEN
        ALTER TABLE messages ADD COLUMN attachments JSONB[];
    END IF;
END $$;

-- Migrate existing data to new structure if source columns exist
DO $$ 
BEGIN
    -- Check if any of the source columns exist
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name IN ('thinking_content', 'plugin', 'thinking_enabled', 'thinking_elapsed_secs', 'citations')
    ) THEN
        -- Update only if source columns exist
        UPDATE messages
        SET 
            -- Move thinking_content to reasoning if it exists
            reasoning = CASE 
                WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'thinking_content')
                THEN thinking_content
                ELSE reasoning
            END,
            
            -- Move plugin to model_params if it exists
            model_params = CASE 
                WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'plugin')
                THEN jsonb_build_object('plugin', plugin)
                ELSE model_params
            END,
            
            -- Move thinking_enabled, thinking_elapsed_secs, and citations to provider_metadata if they exist
            provider_metadata = CASE 
                WHEN EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'messages' 
                    AND column_name IN ('thinking_enabled', 'thinking_elapsed_secs', 'citations')
                ) AND (
                    (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'thinking_enabled') AND thinking_enabled = true)
                    OR (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'citations') AND array_length(citations, 1) > 0)
                ) THEN
                    jsonb_build_object(
                        'thinking_enabled', CASE 
                            WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'thinking_enabled')
                            THEN thinking_enabled
                            ELSE NULL
                        END,
                        'thinking_elapsed_secs', CASE 
                            WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'thinking_elapsed_secs')
                            THEN thinking_elapsed_secs
                            ELSE NULL
                        END,
                        'citations', CASE 
                            WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'citations')
                            THEN citations
                            ELSE NULL
                        END
                    )
                ELSE provider_metadata
            END;
    END IF;
END $$;

-- Add constraints if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'messages' AND constraint_name = 'check_attachments_length') THEN
        ALTER TABLE messages ADD CONSTRAINT check_attachments_length CHECK (array_length(attachments, 1) <= 10);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'messages' AND constraint_name = 'check_reasoning_length') THEN
        ALTER TABLE messages ADD CONSTRAINT check_reasoning_length CHECK (char_length(reasoning) <= 1000000);
    END IF;
END $$;

-- Add indexes if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'idx_messages_provider_metadata') THEN
        CREATE INDEX idx_messages_provider_metadata ON messages USING GIN (provider_metadata);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'idx_messages_model_params') THEN
        CREATE INDEX idx_messages_model_params ON messages USING GIN (model_params);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'idx_messages_attachments') THEN
        CREATE INDEX idx_messages_attachments ON messages USING GIN (attachments);
    END IF;
END $$;

-- Drop old columns if they exist
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'thinking_content') THEN
        ALTER TABLE messages DROP COLUMN thinking_content;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'plugin') THEN
        ALTER TABLE messages DROP COLUMN plugin;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'thinking_enabled') THEN
        ALTER TABLE messages DROP COLUMN thinking_enabled;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'thinking_elapsed_secs') THEN
        ALTER TABLE messages DROP COLUMN thinking_elapsed_secs;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'rag_used') THEN
        ALTER TABLE messages DROP COLUMN rag_used;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'rag_id') THEN
        ALTER TABLE messages DROP COLUMN rag_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'fragment') THEN
        ALTER TABLE messages DROP COLUMN fragment;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'citations') THEN
        ALTER TABLE messages DROP COLUMN citations;
    END IF;
END $$;

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