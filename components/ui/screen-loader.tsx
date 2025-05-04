import { LoaderCircle } from 'lucide-react';
import type { FC } from 'react';

type ScreenLoaderProps = {};

export const ScreenLoader: FC<ScreenLoaderProps> = () => {
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <LoaderCircle className="mt-4 size-12 animate-spin" />
    </div>
  );
};
