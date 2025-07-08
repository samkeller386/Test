import type { FC } from 'react';
import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { TextareaAutosize } from '@/components/ui/textarea-autosize';
import { LimitDisplay } from '@/components/ui/limit-display';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

interface PersonalizationTabProps {
  profileInstructions: string;
  setProfileInstructions: (value: string) => void;
  onSave: () => void;
  isMobile: boolean;
}

export const PersonalizationTab: FC<PersonalizationTabProps> = ({
  profileInstructions,
  setProfileInstructions,
  onSave,
  isMobile,
}) => {
  const [nickname, setNickname] = useState('');
  const [occupation, setOccupation] = useState('');
  const [traits, setTraits] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [maxChats, setMaxChats] = useState(false);

  // Parse existing profileInstructions on mount
  useEffect(() => {
    if (profileInstructions) {
      try {
        const parsed = JSON.parse(profileInstructions);
        setNickname(parsed.nickname || '');
        setOccupation(parsed.occupation || '');
        setTraits(parsed.traits || '');
        setAdditionalInfo(parsed.additionalInfo || '');
        setMaxChats(parsed.maxChats || false);
      } catch {
        // If it's not JSON, treat as legacy format (additionalInfo)
        setAdditionalInfo(profileInstructions);
      }
    }
  }, [profileInstructions]);

  // Update profileInstructions when any field changes
  useEffect(() => {
    const data = {
      nickname,
      occupation,
      traits,
      additionalInfo,
      maxChats,
    };
    setProfileInstructions(JSON.stringify(data));
  }, [nickname, occupation, traits, additionalInfo, maxChats, setProfileInstructions]);

  const isNicknameOverLimit = nickname.length > 50;
  const isOccupationOverLimit = occupation.length > 100;
  const isTraitsOverLimit = traits.length > 100;
  const isAdditionalInfoOverLimit = additionalInfo.length > 3000;
  const isAnyOverLimit = isNicknameOverLimit || isOccupationOverLimit || isTraitsOverLimit || isAdditionalInfoOverLimit;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nickname" className="text-sm font-medium">
            What should PentestGPT call you?
          </Label>
          <div className="space-y-1">
            <Input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Nickname"
              className={`${isNicknameOverLimit ? 'border-red-500' : ''} bg-secondary`}
              maxLength={60} // Allow slightly over limit for warning
            />
            <LimitDisplay
              used={nickname.length}
              limit={50}
              isOverLimit={isNicknameOverLimit}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="occupation" className="text-sm font-medium">
            What do you do?
          </Label>
          <div className="space-y-1">
            <Input
              id="occupation"
              type="text"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="Level 10 mage"
              className={`${isOccupationOverLimit ? 'border-red-500' : ''} bg-secondary`}
              maxLength={110} // Allow slightly over limit for warning
            />
            <LimitDisplay
              used={occupation.length}
              limit={100}
              isOverLimit={isOccupationOverLimit}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">
            What traits should PentestGPT have?
          </Label>
          <div className="space-y-1">
            <TextareaAutosize
              value={traits}
              onValueChange={setTraits}
              placeholder="Describe or select traits"
              minRows={3}
              maxRows={6}
              className={`${isTraitsOverLimit ? 'border-red-500' : ''} bg-secondary`}
            />
            <LimitDisplay
              used={traits.length}
              limit={100}
              isOverLimit={isTraitsOverLimit}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Anything else PentestGPT should know about you?
          </Label>
          <div className="space-y-1">
            <TextareaAutosize
              value={additionalInfo}
              onValueChange={setAdditionalInfo}
              placeholder="Interests, values, or preferences to keep in mind"
              minRows={6}
              maxRows={10}
              className={`${isAdditionalInfoOverLimit ? 'border-red-500' : ''} bg-secondary`}
            />
            <LimitDisplay
              used={additionalInfo.length}
              limit={3000}
              isOverLimit={isAdditionalInfoOverLimit}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="maxChats"
            checked={maxChats}
            onCheckedChange={(checked) => setMaxChats(checked as boolean)}
          />
          <Label htmlFor="maxChats" className="text-sm font-medium">
            Max chats
          </Label>
        </div>
      </div>

      {isMobile && (
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={isAnyOverLimit}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
};
