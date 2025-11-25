/**
 * Supabase Database Types
 * Auto-generated types for type-safe database queries
 */

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          microsoft_id: string | null;
          // Discord Authentication
          discord_id: string | null;
          discord_username: string | null;
          discord_discriminator: string | null;
          discord_global_name: string | null;
          discord_avatar: string | null;
          // Profile
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          // Minecraft
          minecraft_username: string | null;
          minecraft_uuid: string | null;
          is_minecraft_verified: boolean;
          // Discord Server Membership
          is_discord_member: boolean;
          discord_member_since: string | null;
          last_discord_sync: string | null;
          // Discord Roles
          discord_roles: string[];
          has_partner_role: boolean;
          partner_role_id: string | null;
          // Roles
          role: 'admin' | 'partner' | 'user';
          partner_id: string | null;
          partner_name: string | null;
          partner_logo: string | null;
          partner_website: string | null;
          partner_discord: string | null;
          // Account Linking
          linked_at: string | null;
          was_anonymous: boolean;
          // Metadata
          is_active: boolean;
          is_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          microsoft_id?: string | null;
          discord_id?: string | null;
          discord_username?: string | null;
          discord_discriminator?: string | null;
          discord_global_name?: string | null;
          discord_avatar?: string | null;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          minecraft_username?: string | null;
          minecraft_uuid?: string | null;
          is_minecraft_verified?: boolean;
          is_discord_member?: boolean;
          discord_member_since?: string | null;
          last_discord_sync?: string | null;
          discord_roles?: string[];
          has_partner_role?: boolean;
          partner_role_id?: string | null;
          role?: 'admin' | 'partner' | 'user';
          partner_id?: string | null;
          partner_name?: string | null;
          partner_logo?: string | null;
          partner_website?: string | null;
          partner_discord?: string | null;
          linked_at?: string | null;
          was_anonymous?: boolean;
          is_active?: boolean;
          is_verified?: boolean;
        };
        Update: {
          microsoft_id?: string | null;
          discord_id?: string | null;
          discord_username?: string | null;
          discord_discriminator?: string | null;
          discord_global_name?: string | null;
          discord_avatar?: string | null;
          email?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          minecraft_username?: string | null;
          minecraft_uuid?: string | null;
          is_minecraft_verified?: boolean;
          is_discord_member?: boolean;
          discord_member_since?: string | null;
          last_discord_sync?: string | null;
          discord_roles?: string[];
          has_partner_role?: boolean;
          partner_role_id?: string | null;
          role?: 'admin' | 'partner' | 'user';
          partner_id?: string | null;
          partner_name?: string | null;
          partner_logo?: string | null;
          partner_website?: string | null;
          partner_discord?: string | null;
          linked_at?: string | null;
          was_anonymous?: boolean;
          is_active?: boolean;
          is_verified?: boolean;
        };
      };
      modpacks: {
        Row: {
          id: string;
          slug: string;
          category: 'official' | 'partner' | 'community';
          name_i18n: Record<string, string>;
          short_description_i18n: Record<string, string>;
          description_i18n: Record<string, string>;
          version: string;
          minecraft_version: string;
          modloader: 'forge' | 'fabric' | 'neoforge' | 'quilt';
          modloader_version: string;
          gamemode: string | null;
          server_ip: string | null;
          modpack_file_path: string | null;
          modpack_file_url: string | null;
          modpack_file_size: number | null;
          modpack_file_sha256: string | null;
          logo_path: string | null;
          logo_url: string | null;
          banner_path: string | null;
          banner_url: string | null;
          background_image_url: string | null;
          primary_color: string | null;
          author_id: string;
          partner_id: string | null;
          upload_status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
          is_active: boolean;
          is_new: boolean;
          is_coming_soon: boolean;
          youtube_embed: string | null;
          tiktok_embed: string | null;
          leaderboard_path: string | null;
          created_at: string;
          updated_at: string;
          published_at: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          category: 'official' | 'partner' | 'community';
          name_i18n: Record<string, string>;
          short_description_i18n?: Record<string, string>;
          description_i18n?: Record<string, string>;
          version: string;
          minecraft_version: string;
          modloader: 'forge' | 'fabric' | 'neoforge' | 'quilt';
          modloader_version: string;
          gamemode?: string | null;
          server_ip?: string | null;
          modpack_file_path?: string | null;
          modpack_file_url?: string | null;
          modpack_file_size?: number | null;
          modpack_file_sha256?: string | null;
          logo_path?: string | null;
          logo_url?: string | null;
          banner_path?: string | null;
          banner_url?: string | null;
          background_image_url?: string | null;
          primary_color?: string | null;
          author_id: string;
          partner_id?: string | null;
          upload_status?: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
          is_active?: boolean;
          is_new?: boolean;
          is_coming_soon?: boolean;
          youtube_embed?: string | null;
          tiktok_embed?: string | null;
          leaderboard_path?: string | null;
        };
        Update: {
          slug?: string;
          category?: 'official' | 'partner' | 'community';
          name_i18n?: Record<string, string>;
          short_description_i18n?: Record<string, string>;
          description_i18n?: Record<string, string>;
          version?: string;
          minecraft_version?: string;
          modloader?: 'forge' | 'fabric' | 'neoforge' | 'quilt';
          modloader_version?: string;
          gamemode?: string | null;
          server_ip?: string | null;
          modpack_file_path?: string | null;
          modpack_file_url?: string | null;
          modpack_file_size?: number | null;
          modpack_file_sha256?: string | null;
          logo_path?: string | null;
          logo_url?: string | null;
          banner_path?: string | null;
          banner_url?: string | null;
          background_image_url?: string | null;
          primary_color?: string | null;
          partner_id?: string | null;
          upload_status?: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
          is_active?: boolean;
          is_new?: boolean;
          is_coming_soon?: boolean;
          youtube_embed?: string | null;
          tiktok_embed?: string | null;
          leaderboard_path?: string | null;
        };
      };
      modpack_features: {
        Row: {
          id: string;
          modpack_id: string;
          title_i18n: Record<string, string>;
          description_i18n: Record<string, string>;
          icon: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          modpack_id: string;
          title_i18n: Record<string, string>;
          description_i18n: Record<string, string>;
          icon?: string | null;
          sort_order?: number;
        };
        Update: {
          title_i18n?: Record<string, string>;
          description_i18n?: Record<string, string>;
          icon?: string | null;
          sort_order?: number;
        };
      };
      modpack_images: {
        Row: {
          id: string;
          modpack_id: string;
          image_path: string;
          image_url: string;
          sort_order: number;
          width: number | null;
          height: number | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          modpack_id: string;
          image_path: string;
          image_url: string;
          sort_order?: number;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
        };
        Update: {
          image_path?: string;
          image_url?: string;
          sort_order?: number;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
        };
      };
      modpack_collaborators: {
        Row: {
          id: string;
          modpack_id: string;
          name: string;
          role: string;
          avatar: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          modpack_id: string;
          name: string;
          role: string;
          avatar?: string | null;
          sort_order?: number;
        };
        Update: {
          name?: string;
          role?: string;
          avatar?: string | null;
          sort_order?: number;
        };
      };
      modpack_stats: {
        Row: {
          id: string;
          modpack_id: string;
          user_id: string | null;
          downloads: number;
          playtime_hours: number;
          rating: number | null;
          last_played: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          modpack_id: string;
          user_id?: string | null;
          downloads?: number;
          playtime_hours?: number;
          rating?: number | null;
          last_played?: string | null;
        };
        Update: {
          downloads?: number;
          playtime_hours?: number;
          rating?: number | null;
          last_played?: string | null;
        };
      };
      modpack_versions: {
        Row: {
          id: string;
          modpack_id: string;
          version: string;
          changelog_i18n: Record<string, string>;
          file_path: string | null;
          file_url: string | null;
          file_size: number | null;
          file_sha256: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          modpack_id: string;
          version: string;
          changelog_i18n?: Record<string, string>;
          file_path?: string | null;
          file_url?: string | null;
          file_size?: number | null;
          file_sha256?: string | null;
        };
        Update: {
          version?: string;
          changelog_i18n?: Record<string, string>;
          file_path?: string | null;
          file_url?: string | null;
          file_size?: number | null;
          file_sha256?: string | null;
        };
      };
      modpack_reviews: {
        Row: {
          id: string;
          modpack_id: string;
          user_id: string;
          rating: number;
          title: string | null;
          comment: string | null;
          is_approved: boolean;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          modpack_id: string;
          user_id: string;
          rating: number;
          title?: string | null;
          comment?: string | null;
          is_approved?: boolean;
          is_hidden?: boolean;
        };
        Update: {
          rating?: number;
          title?: string | null;
          comment?: string | null;
          is_approved?: boolean;
          is_hidden?: boolean;
        };
      };
    };
    Functions: {
      get_translation: {
        Args: {
          jsonb_data: Record<string, string>;
          p_language: string;
        };
        Returns: string;
      };
      modpacks_i18n: {
        Args: {
          p_language: string;
        };
        Returns: {
          id: string;
          slug: string;
          category: string;
          name: string;
          short_description: string;
          description: string;
          version: string;
          minecraft_version: string;
          modloader: string;
          modloader_version: string;
          gamemode: string | null;
          server_ip: string | null;
          modpack_file_url: string | null;
          modpack_file_size: number | null;
          modpack_file_sha256: string | null;
          logo_url: string | null;
          banner_url: string | null;
          background_image_url: string | null;
          primary_color: string | null;
          author_id: string;
          partner_id: string | null;
          is_active: boolean;
          is_new: boolean;
          is_coming_soon: boolean;
          youtube_embed: string | null;
          tiktok_embed: string | null;
          created_at: string;
          updated_at: string;
          published_at: string | null;
        }[];
      };
      increment_downloads: {
        Args: {
          p_modpack_id: string;
          p_user_id?: string | null;
        };
        Returns: void;
      };
      update_playtime: {
        Args: {
          p_modpack_id: string;
          p_user_id: string | null;
          p_hours: number;
        };
        Returns: void;
      };
      get_modpack_aggregate_stats: {
        Args: {
          p_modpack_id: string;
        };
        Returns: {
          total_downloads: number;
          total_playtime_hours: number;
          average_rating: number | null;
          total_ratings: number;
        };
      };
      check_download_rate_limit: {
        Args: {
          p_modpack_id: string;
          p_user_id: string | null;
          p_max_downloads: number;
          p_time_window: string;
        };
        Returns: boolean;
      };
    };
  };
}
