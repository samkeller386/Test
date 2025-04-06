import { type FC } from 'react';
import { Badge } from '@/components/ui/badge';
import { IconCircleDashed } from '@tabler/icons-react';

export const MessageAskUser: FC = () => {
  return (
    <div className="relative mb-4 flex justify-start">
      <Badge
        variant="outline"
        className="rounded-full border-muted bg-muted px-3 py-1.5 text-sm text-muted-foreground"
      >
        <IconCircleDashed className="mr-1" />
        PentestGPT will continue working after your reply
      </Badge>
    </div>
  );
};
