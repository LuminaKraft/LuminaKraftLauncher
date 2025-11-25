import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Eye, EyeOff, Download, Cloud, Lock } from 'lucide-react';
import ModpackManagementService from '../../services/modpackManagementService';
import { ConfirmDialog } from '../Common/ConfirmDialog';

interface Modpack {
  id: string;
  slug: string;
  category: string;
  name_i18n: Record<string, string>;
  version: string;
  minecraft_version: string;
  modloader: string;
  upload_status: string;
  is_active: boolean;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  downloads?: number;
}

interface PublishedModpacksPageProps {
  onNavigate?: (_section: string, _modpackId?: string) => void;
}

export function PublishedModpacksPage({ onNavigate }: PublishedModpacksPageProps) {
  const { t, i18n } = useTranslation();
  const service = ModpackManagementService.getInstance();

  const [modpacks, setModpacks] = useState<Modpack[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedModpack, setSelectedModpack] = useState<Modpack | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Check permissions
      const { canManage: hasPermission } = await service.canManageModpacks();
      setCanManage(hasPermission);

      if (hasPermission) {
        // Load user's modpacks only if authenticated
        const userModpacks = await service.getUserModpacks();
        setModpacks(userModpacks);
      }
    } catch (error) {
      console.error('Error loading modpacks:', error);
      toast.error(t('publishedModpacks.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (modpackId: string, currentState: boolean) => {
    try {
      const { success, error } = await service.updateModpack(modpackId, {
        isActive: !currentState
      });

      if (success) {
        toast.success(t(!currentState ? 'publishedModpacks.toast.activated' : 'publishedModpacks.toast.deactivated'));
        loadData(); // Reload to reflect changes
      } else {
        toast.error(t('publishedModpacks.toast.updateError', { error }));
      }
    } catch (error) {
      console.error('Error toggling modpack status:', error);
      toast.error(t('publishedModpacks.toast.updateFailed'));
    }
  };

  const handleDelete = (modpack: Modpack) => {
    setSelectedModpack(modpack);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedModpack) return;

    try {
      const toastId = toast.loading(t('publishedModpacks.toast.deleting'));

      const { success, error } = await service.deleteModpack(selectedModpack.id);

      if (success) {
        toast.success(t('publishedModpacks.toast.deleteSuccess'), { id: toastId });
        loadData(); // Reload to reflect changes
      } else {
        toast.error(t('publishedModpacks.toast.deleteError', { error }), { id: toastId });
      }
    } catch (error) {
      console.error('Error deleting modpack:', error);
      toast.error(t('publishedModpacks.toast.deleteFailed'));
    } finally {
      setSelectedModpack(null);
    }
  };

  const getTranslatedName = (nameI18n: Record<string, string>) => {
    const lang = i18n.language;
    return nameI18n[lang] || nameI18n['en'] || 'Unnamed Modpack';
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      uploading: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      processing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };

    const statusKey = `publishedModpacks.uploadStatus.${status}` as const;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || statusColors.pending}`}>
        {t(statusKey)}
      </span>
    );
  };

  const getCategoryBadge = (category: string) => {
    const categoryColors: Record<string, string> = {
      official: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      partner: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      community: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    };

    const categoryKey = `modpacks.category.${category}` as const;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryColors[category] || categoryColors.community}`}>
        {t(categoryKey)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600 dark:text-gray-400">{t('publishedModpacks.loading')}</div>
      </div>
    );
  }

  // Show authentication required screen for non-authenticated users
  if (!canManage) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 text-center">
          {/* Icon */}
          <div className="relative inline-flex items-center justify-center mb-6">
            <Cloud className="w-20 h-20 text-blue-500" />
            <div className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full p-2">
              <Lock className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {t('publishedModpacks.auth.title')}
          </h1>

          {/* Description */}
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
            {t('publishedModpacks.auth.description')}
          </p>

          {/* Authentication Required Message */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8 max-w-2xl mx-auto">
            <div className="flex items-start gap-4">
              <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
              <div className="text-left">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 text-lg">
                  {t('publishedModpacks.auth.required')}
                </h3>
                <p className="text-blue-800 dark:text-blue-200 mb-4">
                  {t('publishedModpacks.auth.requiredDesc')}
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    {t('publishedModpacks.auth.benefits.publish')}
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    {t('publishedModpacks.auth.benefits.track')}
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    {t('publishedModpacks.auth.benefits.manage')}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => {
              // Navigate to settings to link Discord
              onNavigate?.('settings');
            }}
            className="px-8 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors text-lg inline-flex items-center gap-3 shadow-lg hover:shadow-xl"
          >
            <svg className="w-6 h-6" viewBox="0 0 71 55" fill="currentColor">
              <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"/>
            </svg>
            {t('publishedModpacks.auth.signIn')}
          </button>

          {/* Local Modpacks Alternative */}
          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              {t('publishedModpacks.auth.localAlternative')}
            </p>
            <button
              onClick={() => onNavigate?.('my-modpacks')}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {t('publishedModpacks.auth.goToMyModpacks')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('publishedModpacks.title')}
          </h1>
          <button
            onClick={() => onNavigate?.('publish-modpack')}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            {t('publishedModpacks.publishNew')}
          </button>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          {t('publishedModpacks.subtitle')}
        </p>
      </div>

      {/* Modpacks List */}
      {modpacks.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-12 shadow-md text-center">
          <Cloud className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('publishedModpacks.empty.title')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('publishedModpacks.empty.description')}
          </p>
          <button
            onClick={() => onNavigate?.('publish-modpack')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors inline-block"
          >
            {t('publishedModpacks.empty.button')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modpacks.map((modpack) => (
            <div
              key={modpack.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Modpack Image */}
              <div className="h-48 bg-gray-200 dark:bg-gray-700 relative">
                {modpack.logo_url ? (
                  <img
                    src={modpack.logo_url}
                    alt={getTranslatedName(modpack.name_i18n)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
                    <span className="text-4xl font-bold">
                      {getTranslatedName(modpack.name_i18n).charAt(0)}
                    </span>
                  </div>
                )}

                {/* Active Status Indicator */}
                <div className="absolute top-2 right-2">
                  {modpack.is_active ? (
                    <div className="bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {t('publishedModpacks.status.active')}
                    </div>
                  ) : (
                    <div className="bg-gray-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />
                      {t('publishedModpacks.status.inactive')}
                    </div>
                  )}
                </div>
              </div>

              {/* Modpack Info */}
              <div className="p-4">
                <div className="mb-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                    {getTranslatedName(modpack.name_i18n)}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    v{modpack.version} • {modpack.minecraft_version} • {modpack.modloader}
                  </p>
                </div>

                {/* Badges */}
                <div className="flex gap-2 mb-3">
                  {getCategoryBadge(modpack.category)}
                  {getStatusBadge(modpack.upload_status)}
                </div>

                {/* Stats */}
                {modpack.downloads !== undefined && (
                  <div className="flex items-center gap-4 mb-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Download className="w-4 h-4" />
                      <span>{modpack.downloads || 0}</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onNavigate?.('edit-modpack', modpack.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <Edit className="w-4 h-4" />
                      {t('publishedModpacks.actions.edit')}
                    </button>

                    <button
                      onClick={() => handleToggleActive(modpack.id, modpack.is_active)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                        modpack.is_active
                          ? 'bg-gray-600 text-white hover:bg-gray-700'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {modpack.is_active ? (
                        <>
                          <EyeOff className="w-4 h-4" />
                          {t('publishedModpacks.actions.hide')}
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          {t('publishedModpacks.actions.show')}
                        </>
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => handleDelete(modpack)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('publishedModpacks.actions.delete')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Modpack Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setSelectedModpack(null);
        }}
        onConfirm={handleDeleteConfirm}
        title={t('publishedModpacks.deleteDialog.title')}
        message={t('publishedModpacks.deleteDialog.message', { name: selectedModpack ? getTranslatedName(selectedModpack.name_i18n) : '' })}
        confirmText={t('publishedModpacks.deleteDialog.confirm')}
        cancelText={t('publishedModpacks.deleteDialog.cancel')}
        variant="danger"
      />
    </div>
  );
}

export default PublishedModpacksPage;
