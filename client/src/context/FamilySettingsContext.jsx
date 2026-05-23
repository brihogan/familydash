import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import { familyApi } from '../api/family.api.js';

const DEFAULT_LABEL = 'Chores';
const DEFAULT_SETS_STEPS_LABEL = 'Sets & Steps';

function deriveLabels(plural) {
  const cleaned = (plural || DEFAULT_LABEL).trim() || DEFAULT_LABEL;
  const singular = cleaned.endsWith('s') ? cleaned.slice(0, -1) : cleaned;
  return {
    choresLabel: cleaned,
    choreLabel: singular,
    choresLabelLower: cleaned.toLowerCase(),
    choreLabelLower: singular.toLowerCase(),
  };
}

const FamilySettingsContext = createContext({
  useBanking: true,
  updateUseBanking: () => {},
  useSets: true,
  updateUseSets: () => {},
  useTickets: true,
  updateUseTickets: () => {},
  useBadges: true,
  updateUseBadges: () => {},
  ...deriveLabels(DEFAULT_LABEL),
  updateChoresLabel: () => {},
  setsStepsLabel: DEFAULT_SETS_STEPS_LABEL,
  updateSetsStepsLabel: () => {},
});

export function FamilySettingsProvider({ children }) {
  const { user } = useAuth();
  const [useBanking, setUseBanking] = useState(true);
  const [useSets, setUseSets] = useState(true);
  const [useTickets, setUseTickets] = useState(true);
  const [useBadges, setUseBadges] = useState(true);
  const [choresLabelRaw, setChoresLabelRaw] = useState(DEFAULT_LABEL);
  const [setsStepsLabelRaw, setSetsStepsLabelRaw] = useState(DEFAULT_SETS_STEPS_LABEL);

  useEffect(() => {
    if (!user) return;
    familyApi.getSettings()
      .then((data) => {
        setUseBanking(data.useBanking);
        setUseSets(data.useSets ?? true);
        setUseTickets(data.useTickets ?? true);
        setUseBadges(data.useBadges ?? true);
        setChoresLabelRaw(data.choresLabel || DEFAULT_LABEL);
        setSetsStepsLabelRaw(data.setsStepsLabel || DEFAULT_SETS_STEPS_LABEL);
      })
      .catch(() => {}); // default true on error
  }, [user?.familyId]);

  const updateUseBanking = async (val) => {
    setUseBanking(val); // optimistic
    try {
      await familyApi.updateSettings({ use_banking: val });
    } catch {
      setUseBanking(!val); // revert on error
    }
  };

  const updateUseSets = async (val) => {
    setUseSets(val); // optimistic
    try {
      await familyApi.updateSettings({ use_sets: val });
    } catch {
      setUseSets(!val); // revert on error
    }
  };

  const updateUseTickets = async (val) => {
    setUseTickets(val); // optimistic
    try {
      await familyApi.updateSettings({ use_tickets: val });
    } catch {
      setUseTickets(!val); // revert on error
    }
  };

  const updateUseBadges = async (val) => {
    setUseBadges(val); // optimistic
    try {
      await familyApi.updateSettings({ use_badges: val });
    } catch {
      setUseBadges(!val); // revert on error
    }
  };

  const updateChoresLabel = async (val) => {
    const prev = choresLabelRaw;
    const next = (val || '').trim() || DEFAULT_LABEL;
    setChoresLabelRaw(next); // optimistic
    try {
      await familyApi.updateSettings({ chores_label: next });
    } catch {
      setChoresLabelRaw(prev); // revert on error
    }
  };

  const updateSetsStepsLabel = async (val) => {
    const prev = setsStepsLabelRaw;
    const next = (val || '').trim() || DEFAULT_SETS_STEPS_LABEL;
    setSetsStepsLabelRaw(next); // optimistic
    try {
      await familyApi.updateSettings({ sets_steps_label: next });
    } catch {
      setSetsStepsLabelRaw(prev); // revert on error
    }
  };

  const labels = deriveLabels(choresLabelRaw);

  return (
    <FamilySettingsContext.Provider value={{
      useBanking, updateUseBanking,
      useSets, updateUseSets,
      useTickets, updateUseTickets,
      useBadges, updateUseBadges,
      ...labels,
      updateChoresLabel,
      setsStepsLabel: setsStepsLabelRaw,
      updateSetsStepsLabel,
    }}>
      {children}
    </FamilySettingsContext.Provider>
  );
}

export function useFamilySettings() {
  return useContext(FamilySettingsContext);
}
