import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Newspaper, Clock } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHomePageData();
  }, []);

  const loadHomePageData = async () => {
    setLoading(true);
    try {
      const service = LauncherService.getInstance();
      const data = await service.fetchModpacksData();
      const allModpacks = data.modpacks;

      if (allModpacks && allModpacks.length > 0) {

        console.log('All modpacks:', allModpacks.map(m => ({
          name: m.name,
          category: m.category,
          isActive: m.isActive,
          isComingSoon: m.isComingSoon,
          isNew: m.isNew
        })));

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

        console.log('Featured modpacks:', featured.map(m => ({
          name: m.name,
          category: m.category,
          downloads: m.downloads
        })));

        setFeaturedModpacks(featured);
      }
    } catch (error) {
      console.error('Error loading homepage data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-12">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-8 text-white">
        <h1 className="text-4xl font-bold mb-4">{t('home.hero.title')}</h1>
        <p className="text-xl opacity-90">{t('home.hero.subtitle')}</p>
      </div>

      {/* News Section (Placeholder) - Hidden for now */}
      {false && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Newspaper className="w-6 h-6" />
              {t('home.news.title')}
            </h2>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400 text-center">
              {t('home.news.placeholder')}
            </p>
          </div>
        </section>
      )}

      {/* Coming Soon Section */}
      {comingSoonModpacks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="w-6 h-6" />
              {t('home.comingSoon.title')}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {comingSoonModpacks.map(modpack => {
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
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Featured Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('home.featured.title')}
          </h2>
          <button
            onClick={() => onNavigate?.('explore')}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline font-medium group"
          >
            {t('home.viewAll')}
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
        {featuredModpacks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredModpacks.slice(0, 6).map(modpack => {
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
                />
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400 text-center">
              {t('home.featured.empty')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export default HomePage;
