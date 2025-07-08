import type { FC, ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { TextareaAutosize } from '@/components/ui/textarea-autosize';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PersonalizationTabProps {
  profileInstructions: string;
  setProfileInstructions: (value: string) => void;
  onSave: () => void;
  isMobile: boolean;
}

const TRAIT_OPTIONS = [
  'Opinionated',
  'Respectful', 
  'Humble',
  'Professional',
  'Silly',
  'Direct',
  'Pragmatic',
  'Corporate',
  'Chill',
  'Outside the box'
];

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

  // Parse existing profileInstructions on mount
  useEffect(() => {
    if (profileInstructions) {
      // Try to parse the new text format first
      const lines = profileInstructions.split('\n');
      let parsedNickname = '';
      let parsedOccupation = '';
      let parsedAdditionalInfo = '';
      
      lines.forEach((line: string) => {
        if (line.startsWith('Preferred name: ')) {
          parsedNickname = line.substring('Preferred name: '.length);
        } else if (line.startsWith('Role: ')) {
          parsedOccupation = line.substring('Role: '.length);
        } else if (line.startsWith('Other Information: ')) {
          parsedAdditionalInfo = line.substring('Other Information: '.length);
        }
      });
      
      if (parsedNickname || parsedOccupation || parsedAdditionalInfo) {
        setNickname(parsedNickname);
        setOccupation(parsedOccupation);
        setAdditionalInfo(parsedAdditionalInfo);
      } else {
        // Try to parse JSON format (legacy)
        try {
          const parsed = JSON.parse(profileInstructions);
          setNickname(parsed.nickname || '');
          setOccupation(parsed.occupation || '');
          setTraits(parsed.traits || '');
          setAdditionalInfo(parsed.additionalInfo || '');
        } catch {
          // If it's not JSON, treat as legacy format (additionalInfo)
          setAdditionalInfo(profileInstructions);
        }
      }
    }
  }, [profileInstructions]);

  // Update profileInstructions when any field changes
  useEffect(() => {
    let result = '';
    if (nickname) result += `Preferred name: ${nickname}\n`;
    if (occupation) result += `Role: ${occupation}\n`;
    if (additionalInfo) result += `Other Information: ${additionalInfo}`;
    setProfileInstructions(result);
  }, [nickname, occupation, additionalInfo, setProfileInstructions]);

  const isNicknameOverLimit = nickname.length > 50;
  const isOccupationOverLimit = occupation.length > 100;
  const isTraitsOverLimit = traits.length > 100;
  const isAdditionalInfoOverLimit = additionalInfo.length > 3000;
  const isAnyOverLimit = isNicknameOverLimit || isOccupationOverLimit || isTraitsOverLimit || isAdditionalInfoOverLimit;

  const handleTraitClick = (trait: string) => {
    const currentTraits = traits.split(',').map((t: string) => t.trim()).filter((t: string) => t);
    if (currentTraits.includes(trait)) {
      // Remove trait
      const updatedTraits = currentTraits.filter((t: string) => t !== trait);
      setTraits(updatedTraits.join(', '));
    } else {
      // Add trait
      const updatedTraits = [...currentTraits, trait];
      setTraits(updatedTraits.join(', '));
    }
  };

  const isTraitSelected = (trait: string) => {
    return traits.split(',').map((t: string) => t.trim()).includes(trait);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="nickname" className="text-sm font-medium">
            What should PentestGPT call you?
          </Label>
          <div className="relative">
            <Input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Nickname"
              className={`${isNicknameOverLimit ? 'border-red-500' : ''} bg-secondary pb-6`}
              maxLength={60}
            />
            <div className="absolute bottom-2 left-3 text-xs text-muted-foreground">
              {nickname.length}/50
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label htmlFor="occupation" className="text-sm font-medium">
            What do you do?
          </Label>
          <div className="relative">
            <Input
              id="occupation"
              type="text"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="Penetration Tester, student, etc."
              className={`${isOccupationOverLimit ? 'border-red-500' : ''} bg-secondary pb-6`}
              maxLength={110}
            />
            <div className="absolute bottom-2 left-3 text-xs text-muted-foreground">
              {occupation.length}/100
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">
            What traits should PentestGPT have?
          </Label>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TRAIT_OPTIONS.map((trait) => (
                <Button
                  key={trait}
                  type="button"
                  variant={isTraitSelected(trait) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTraitClick(trait)}
                  className="text-sm"
                >
                  {isTraitSelected(trait) ? '+ ' : '+ '}{trait}
                </Button>
              ))}
            </div>
            <div className="relative">
              <TextareaAutosize
                value={traits}
                onValueChange={setTraits}
                placeholder="Describe or select traits"
                minRows={3}
                maxRows={6}
                className={`${isTraitsOverLimit ? 'border-red-500' : ''} bg-secondary pb-6`}
              />
              <div className="absolute bottom-2 left-3 text-xs text-muted-foreground">
                {traits.length}/100
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">
            Anything else PentestGPT should know about you?
          </Label>
          <div className="relative">
            <TextareaAutosize
              value={additionalInfo}
              onValueChange={setAdditionalInfo}
              placeholder="Interests, values, or preferences to keep in mind"
              minRows={6}
              maxRows={10}
              className={`${isAdditionalInfoOverLimit ? 'border-red-500' : ''} bg-secondary pb-6`}
            />
            <div className="absolute bottom-2 left-3 text-xs text-muted-foreground">
              {additionalInfo.length}/3000
            </div>
          </div>
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
