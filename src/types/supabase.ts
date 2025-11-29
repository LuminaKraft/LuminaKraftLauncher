export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Helper types for easier access
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

export interface Database {
  public: {
    Tables: {
      partners: {
        Row: {
          id: string
          name: string
          logo_url: string | null
          website_url: string | null
          discord_invite: string | null
          discord_role_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          logo_url?: string | null
          website_url?: string | null
          discord_invite?: string | null
          discord_role_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          logo_url?: string | null
          website_url?: string | null
          discord_invite?: string | null
          discord_role_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          microsoft_id: string | null
          microsoft_linked_at: string | null
          discord_id: string | null
          discord_username: string | null
          discord_global_name: string | null
          discord_avatar: string | null
          discord_linked_at: string | null
          display_name: string | null
          avatar_url: string | null
          email: string | null
          minecraft_username: string | null
          minecraft_uuid: string | null
          minecraft_username_history: Json | null
          is_minecraft_verified: boolean
          is_discord_member: boolean
          discord_member_since: string | null
          last_discord_sync: string | null
          discord_roles: Json | null
          has_partner_role: boolean
          partner_id: string | null
          role: string
          is_active: boolean
          is_verified: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          microsoft_id?: string | null
          microsoft_linked_at?: string | null
          discord_id?: string | null
          discord_username?: string | null
          discord_global_name?: string | null
          discord_avatar?: string | null
          discord_linked_at?: string | null
          display_name?: string | null
          avatar_url?: string | null
          email?: string | null
          minecraft_username?: string | null
          minecraft_uuid?: string | null
          minecraft_username_history?: Json | null
          is_minecraft_verified?: boolean
          is_discord_member?: boolean
          discord_member_since?: string | null
          last_discord_sync?: string | null
          discord_roles?: Json | null
          has_partner_role?: boolean
          partner_id?: string | null
          role?: string
          is_active?: boolean
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          microsoft_id?: string | null
          microsoft_linked_at?: string | null
          discord_id?: string | null
          discord_username?: string | null
          discord_global_name?: string | null
          discord_avatar?: string | null
          discord_linked_at?: string | null
          display_name?: string | null
          avatar_url?: string | null
          email?: string | null
          minecraft_username?: string | null
          minecraft_uuid?: string | null
          minecraft_username_history?: Json | null
          is_minecraft_verified?: boolean
          is_discord_member?: boolean
          discord_member_since?: string | null
          last_discord_sync?: string | null
          discord_roles?: Json | null
          has_partner_role?: boolean
          partner_id?: string | null
          role?: string
          is_active?: boolean
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
