import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Eye, EyeOff, Download, TrendingUp, Cloud, Lock } from 'lucide-react';
import ModpackManagementService from '../../services/modpackManagementService';
import { useLauncher } from '../../contexts/LauncherContext';
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
  onNavigate?: (section: string, modpackId?: string) => void;
}

export function PublishedModpacksPage({ onNavigate }: PublishedModpacksPageProps) {
  const { t, i18n } = useTranslation();
  const service = ModpackManagementService.getInstance();
  const { userSettings, handleMicrosoftLogin } = useLauncher();

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
      toast.error('Failed to load modpacks');
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
        toast.success(`Modpack ${!currentState ? 'activated' : 'deactivated'}`);
        loadData(); // Reload to reflect changes
      } else {
        toast.error(`Error: ${error}`);
      }
    } catch (error) {
      console.error('Error toggling modpack status:', error);
      toast.error('Failed to update modpack');
    }
  };

  const handleDelete = (modpack: Modpack) => {
    setSelectedModpack(modpack);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedModpack) return;

    try {
      const toastId = toast.loading('Deleting modpack...');

      const { success, error } = await service.deleteModpack(selectedModpack.id);

      if (success) {
        toast.success('Modpack deleted successfully', { id: toastId });
        loadData(); // Reload to reflect changes
      } else {
        toast.error(`Error: ${error}`, { id: toastId });
      }
    } catch (error) {
      console.error('Error deleting modpack:', error);
      toast.error('Failed to delete modpack');
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

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || statusColors.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getCategoryBadge = (category: string) => {
    const categoryColors: Record<string, string> = {
      official: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      partner: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      community: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryColors[category] || categoryColors.community}`}>
        {category.charAt(0).toUpperCase() + category.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading...</div>
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
            Public Modpacks
          </h1>

          {/* Description */}
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
            Share your custom modpacks with the entire LuminaKraft community.
            Publish, manage, and track your public modpacks all in one place.
          </p>

          {/* Authentication Required Message */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8 max-w-2xl mx-auto">
            <div className="flex items-start gap-4">
              <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
              <div className="text-left">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 text-lg">
                  Microsoft Account Required
                </h3>
                <p className="text-blue-800 dark:text-blue-200 mb-4">
                  To publish and manage public modpacks, you need to authenticate with your Microsoft account.
                  This ensures proper attribution and allows you to manage your published content.
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    Publish modpacks to the community
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    Track downloads and statistics
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    Update and manage your content
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleMicrosoftLogin}
            className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors text-lg inline-flex items-center gap-3 shadow-lg hover:shadow-xl"
          >
            <svg className="w-6 h-6" viewBox="0 0 23 23" fill="none">
              <path d="M0 0h11v11H0V0z" fill="#F25022"/>
              <path d="M12 0h11v11H12V0z" fill="#7FBA00"/>
              <path d="M0 12h11v11H0V12z" fill="#00A4EF"/>
              <path d="M12 12h11v11H12V12z" fill="#FFB900"/>
            </svg>
            Sign in with Microsoft
          </button>

          {/* Local Modpacks Alternative */}
          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              Just want to manage modpacks locally?
            </p>
            <button
              onClick={() => onNavigate?.('my-modpacks')}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Go to My Modpacks →
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
            Public Modpacks
          </h1>
          <button
            onClick={() => onNavigate?.('publish-modpack')}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Publish New Modpack
          </button>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your publicly published modpacks on the platform
        </p>
      </div>

      {/* Modpacks List */}
      {modpacks.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-12 shadow-md text-center">
          <Cloud className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No public modpacks yet
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Publish your first modpack to share it with the community
          </p>
          <button
            onClick={() => onNavigate?.('publish-modpack')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors inline-block"
          >
            Publish Your First Modpack
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
                      Active
                    </div>
                  ) : (
                    <div className="bg-gray-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />
                      Inactive
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
                      Edit
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
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          Show
                        </>
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => handleDelete(modpack)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
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
        title="Delete Modpack?"
        message={`Are you sure you want to delete "${selectedModpack ? getTranslatedName(selectedModpack.name_i18n) : ''}"? This action cannot be undone and will remove the modpack from the platform.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

export default PublishedModpacksPage;
