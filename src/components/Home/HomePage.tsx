import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock, Play } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import ModpackCard from '../Modpacks/ModpackCard';
import { Modpack } from '../../types/launcher';
import LauncherService from '../../services/launcherService';
import { useLauncher } from '../../contexts/LauncherContext';

interface HomePageProps {
  onNavigate?: (_section: string, _modpackId?: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { t } = useTranslation();
  const { modpackStates } = useLauncher();
  const [comingSoonModpacks, setComingSoonModpacks] = useState<Modpack[]>([]);
  const [featuredModpacks, setFeaturedModpacks] = useState<Modpack[]>([]);
  const [discoverModpacks, setDiscoverModpacks] = useState<Modpack[]>([]);
  const [localModpacksMap, setLocalModpacksMap] = useState<Map<string, Modpack>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHomePageData();
  }, []);

  // Load local modpack metadata when installed modpacks change
  useEffect(() => {
    const loadLocalModpacks = async () => {
      const installedIds = Object.entries(modpackStates)
        .filter(([_, state]) => state.installed)
        .map(([id]) => id);

      const newMap = new Map<string, Modpack>();

      for (const id of installedIds) {
        // Skip if already in server modpacks
        if ([...featuredModpacks, ...comingSoonModpacks, ...discoverModpacks].some(m => m.id === id)) {
          continue;
        }

        try {
          // Get cached modpack data (name, logo, etc.)
          const cachedData = await invoke<string | null>('get_cached_modpack_data', {
            modpackId: id
          });

          // Get instance metadata (minecraft version, modloader, etc.)
          const instanceMetadata = await invoke<string | null>('get_instance_metadata', {
            modpackId: id
          });

          let modpack: Modpack = {
            id,
            name: 'Local Modpack',
            description: '',
            version: '',
            minecraftVersion: '',
            modloader: '',
            modloaderVersion: '',
            isActive: true, // Local modpacks are always active
            isComingSoon: false,
            isNew: false,
            logo: '',
            backgroundImage: '',
          } as Modpack;

          // Merge cached data if available
          if (cachedData) {
            const cached = JSON.parse(cachedData);
            console.log(`📦 [HomePage] Cached data for ${id}:`, cached);
            modpack = { ...modpack, ...cached, isActive: true };
          }

          // Merge instance metadata if available
          if (instanceMetadata) {
            const instance = JSON.parse(instanceMetadata);
            console.log(`📋 [HomePage] Instance metadata for ${id}:`, instance);
            modpack = {
              ...modpack,
              name: instance.name || modpack.name,
              version: instance.version || modpack.version,
              minecraftVersion: instance.minecraftVersion || modpack.minecraftVersion,
              modloader: instance.modloader || modpack.modloader,
              modloaderVersion: instance.modloaderVersion || modpack.modloaderVersion,
            };
          } else {
            console.log(`⚠️ [HomePage] No instance metadata for ${id}`);
          }

          newMap.set(id, modpack);
        } catch (error) {
          console.error(`Failed to load local modpack ${id}:`, error);
        }
      }

      setLocalModpacksMap(newMap);
    };

    if (!loading) {
      loadLocalModpacks();
    }
  }, [modpackStates, loading, featuredModpacks, comingSoonModpacks, discoverModpacks]);

  const loadHomePageData = async () => {
    setLoading(true);
    try {
      const service = LauncherService.getInstance();
      const data = await service.fetchModpacksData();
      const allModpacks = data.modpacks;

      if (allModpacks && allModpacks.length > 0) {
        // Filter Coming Soon modpacks (active + coming soon)
        const comingSoon = allModpacks.filter(
          modpack => modpack.isActive && modpack.isComingSoon
        );
        setComingSoonModpacks(comingSoon);

        // Filter Featured modpacks (active + NOT coming soon + (official OR partner OR new))
        const featured = allModpacks
          .filter(
            modpack => modpack.isActive && !modpack.isComingSoon &&
              (modpack.category === 'official' || modpack.category === 'partner' || modpack.isNew)
          )
          .sort((a, b) => (b.downloads || 0) - (a.downloads || 0)); // Sort by downloads descending

        setFeaturedModpacks(featured);

        // Get random modpacks for discover section (active + NOT coming soon + NOT in featured)
        const availableForDiscover = allModpacks.filter(
          modpack => modpack.isActive && !modpack.isComingSoon &&
            !featured.some(f => f.id === modpack.id)
        );

        // Shuffle and take 4
        const shuffled = [...availableForDiscover].sort(() => Math.random() - 0.5);
        setDiscoverModpacks(shuffled.slice(0, 4));
      }
    } catch (error) {
      console.error('Error loading homepage data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Build a map of all available modpacks (server + local)
  const allModpacksMap = useMemo(() => {
    const map = new Map<string, Modpack>();

    // Add server modpacks
    [...featuredModpacks, ...comingSoonModpacks, ...discoverModpacks].forEach(m => {
      map.set(m.id, m);
    });

    // Add local modpacks
    localModpacksMap.forEach((modpack, id) => {
      if (!map.has(id)) {
        map.set(id, modpack);
      }
    });

    return map;
  }, [featuredModpacks, comingSoonModpacks, discoverModpacks, localModpacksMap]);

  // Get recently played instances
  const recentInstances = useMemo(() => {
    const installed = Object.entries(modpackStates)
      .filter(([_, state]) => state.installed)
      .map(([id]) => id)
      .slice(0, 3); // Get top 3

    return installed;
  }, [modpackStates]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Minimal Hero Section - More professional */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-white mb-1">{t('home.hero.title')}</h1>
        <p className="text-sm text-gray-400">{t('home.hero.subtitle')}</p>
      </div>

      {/* Jump back in Section */}
      {recentInstances.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Play className="w-5 h-5" />
              {t('home.jumpBackIn.title')}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentInstances.map((modpackId, index) => {
              const modpack = allModpacksMap.get(modpackId);

              if (!modpack) return null;

              const state = modpackStates[modpack.id] || {
                installed: false,
                downloading: false,
                progress: { percentage: 0 },
                status: 'not_installed' as const
              };

              return (
                <ModpackCard
                  key={modpack.id}
                  modpack={modpack}
                  state={state}
                  onSelect={() => onNavigate?.('my-modpacks', modpack.id)}
                  index={index}
                  isReadOnly={false}
                  onNavigateToMyModpacks={() => onNavigate?.('my-modpacks')}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Coming Soon Section */}
      {comingSoonModpacks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t('home.comingSoon.title')}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {comingSoonModpacks.slice(0, 4).map((modpack, index) => {
              const state = modpackStates[modpack.id] || {
                installed: false,
                downloading: false,
                progress: { percentage: 0 },
                status: 'not_installed' as const
              };
              return (
                <ModpackCard
                  key={modpack.id}
                  modpack={modpack}
                  state={state}
                  onSelect={() => onNavigate?.('explore', modpack.id)}
                  index={index}
                  isReadOnly={true}
                  onNavigateToMyModpacks={() => onNavigate?.('my-modpacks')}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Featured Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            {t('home.featured.title')}
          </h2>
          <button
            onClick={() => onNavigate?.('explore')}
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium group transition-colors duration-150"
          >
            {t('home.viewAll')}
            <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
          </button>
        </div>
        {featuredModpacks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featuredModpacks.slice(0, 6).map((modpack, index) => {
              const state = modpackStates[modpack.id] || {
                installed: false,
                downloading: false,
                progress: { percentage: 0 },
                status: 'not_installed' as const
              };
              return (
                <ModpackCard
                  key={modpack.id}
                  modpack={modpack}
                  state={state}
                  onSelect={() => onNavigate?.('explore', modpack.id)}
                  index={index}
                  isReadOnly={true}
                  onNavigateToMyModpacks={() => onNavigate?.('my-modpacks')}
                />
              );
            })}
          </div>
        ) : (
          <div className="bg-dark-800 rounded-lg p-8 border border-dark-700">
            <p className="text-gray-400 text-center">
              {t('home.featured.empty')}
            </p>
          </div>
        )}
      </section>

      {/* Discover Section */}
      {discoverModpacks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">
              {t('home.discover.title')}
            </h2>
            <button
              onClick={() => onNavigate?.('explore')}
              className="flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium group transition-colors duration-150"
            >
              {t('home.discover.viewAll')}
              <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {discoverModpacks.map((modpack, index) => {
              const state = modpackStates[modpack.id] || {
                installed: false,
                downloading: false,
                progress: { percentage: 0 },
                status: 'not_installed' as const
              };
              return (
                <ModpackCard
                  key={modpack.id}
                  modpack={modpack}
                  state={state}
                  onSelect={() => onNavigate?.('explore', modpack.id)}
                  index={index}
                  isReadOnly={true}
                  onNavigateToMyModpacks={() => onNavigate?.('my-modpacks')}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default HomePage;
