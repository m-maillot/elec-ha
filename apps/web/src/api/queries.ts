import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsDto, SettingsUpdateDto, SimulateRequest } from '@elec-ha/core';
import { api } from './client.js';

export const keys = {
  settings: ['settings'] as const,
  haEntities: ['ha', 'entities'] as const,
  tempoDays: (from: string, to: string) => ['tempo', 'days', from, to] as const,
  consumption: (from: string, to: string, g: string) => ['consumption', from, to, g] as const,
  simulate: (body: unknown) => ['simulate', body] as const,
};

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.getSettings, staleTime: 60_000 });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdateDto) => api.updateSettings(patch),
    onSuccess: (data: SettingsDto) => qc.setQueryData(keys.settings, data),
  });
}

export function useHaEntities(enabled: boolean) {
  return useQuery({ queryKey: keys.haEntities, queryFn: api.getHaEntities, enabled, retry: false });
}

export function useConsumption(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.consumption(from, to, 'hour'),
    queryFn: () => api.getConsumption(from, to, 'hour'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSimulate(body: SimulateRequest, enabled: boolean) {
  return useQuery({
    queryKey: keys.simulate(body),
    queryFn: () => api.simulate(body),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}
