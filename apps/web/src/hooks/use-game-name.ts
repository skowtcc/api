import { useSettings } from "@/hooks/use-settings";
import { getGameAbbreviation } from "@/constants/abbreviations";

export function useGameName(name: string): string {
  const { settings } = useSettings();
  return settings.useGameAbbreviations ? getGameAbbreviation(name) : name;
}
