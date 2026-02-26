import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import { familyApi } from '../api/family.api.js';

const FamilySettingsContext = createContext({ useBanking: true, updateUseBanking: () => {}, useSets: true, updateUseSets: () => {}, useTickets: true, updateUseTickets: () => {} });

export function FamilySettingsProvider({ children }) {
  const { user } = useAuth();
  const [useBanking, setUseBanking] = useState(true);
  const [useSets, setUseSets] = useState(true);
  const [useTickets, setUseTickets] = useState(true);

  useEffect(() => {
    if (!user) return;
    familyApi.getSettings()
      .then((data) => {
        setUseBanking(data.useBanking);
        setUseSets(data.useSets ?? true);
        setUseTickets(data.useTickets ?? true);
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

  return (
    <FamilySettingsContext.Provider value={{ useBanking, updateUseBanking, useSets, updateUseSets, useTickets, updateUseTickets }}>
      {children}
    </FamilySettingsContext.Provider>
  );
}

export function useFamilySettings() {
  return useContext(FamilySettingsContext);
}
