import { useState } from 'react';
import toast from 'react-hot-toast';
import ModpackValidationService, { ModFileInfo } from '../services/modpackValidationService';
import ModpackManagementService from '../services/modpackManagementService';
import { ParsedModpackData } from '../types/launcher';

interface ValidationData {
    modpackName: string;
    modsWithoutUrl: ModFileInfo[];
    modsInOverrides: string[];
}

interface UseModpackValidationProps {
    onManifestParsed?: (data: ParsedModpackData) => void;
}

export function useModpackValidation({ onManifestParsed }: UseModpackValidationProps = {}) {
    const [isParsing, setIsParsing] = useState(false);
    const [validationData, setValidationData] = useState<ValidationData | null>(null);
    const [showValidationDialog, setShowValidationDialog] = useState(false);
    const [manifestParsed, setManifestParsed] = useState(false);

    const validationService = ModpackValidationService.getInstance();
    const service = ModpackManagementService.getInstance();

    const validateAndParseManifest = async (file: File) => {
        setIsParsing(true);
        setManifestParsed(false);

        try {
            // 1. Validate ZIP structure and check for missing mod URLs
            const validationResult = await validationService.validateModpackZip(file);
            if (!validationResult.success) {
                toast.error(validationResult.error || 'Failed to validate modpack');
                return false;
            }

            // 2. Check for mods that need manual download (not in overrides)
            if (validationResult.modsWithoutUrl && validationResult.modsWithoutUrl.length > 0) {
                const missingMods = validationResult.modsWithoutUrl.filter(
                    mod => !validationResult.modsInOverrides?.includes(mod.fileName)
                );

                if (missingMods.length > 0) {
                    setValidationData({
                        modpackName: validationResult.manifest?.name || file.name,
                        modsWithoutUrl: missingMods,
                        modsInOverrides: validationResult.modsInOverrides || []
                    });
                    setShowValidationDialog(true);
                    // Don't return here, we still want to parse the manifest if possible, 
                    // but the dialog will block the user from proceeding until they fix it or cancel
                }
            }

            // 3. Parse manifest for metadata
            const parseResult = await service.parseManifestFromZip(file);
            if (!parseResult.success || !parseResult.data) {
                toast.error(parseResult.error || 'Failed to parse manifest.json');
                return false;
            }

            setManifestParsed(true);
            if (onManifestParsed) {
                onManifestParsed(parseResult.data);
            }


            return true;
        } catch (error) {
            console.error('Error validating manifest:', error);
            toast.error(t('errors.failedValidateModpack'));
            return false;
        } finally {
            setIsParsing(false);
        }
    };

    const resetValidation = () => {
        setValidationData(null);
        setShowValidationDialog(false);
        setManifestParsed(false);
    };

    return {
        isParsing,
        validationData,
        showValidationDialog,
        setShowValidationDialog,
        manifestParsed,
        validateAndParseManifest,
        resetValidation
    };
}
