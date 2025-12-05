import React from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { X, LogIn, Link } from 'lucide-react';

interface RateLimitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  errorCode: string;
  limit: number;
  resetAt: string;
  onLogin?: () => void;
  onLinkDiscord?: () => void;
}

export default function RateLimitDialog({
  isOpen,
  onClose,
  errorCode,
  limit,
  resetAt,
  onLogin,
  onLinkDiscord
}: RateLimitDialogProps) {
  const { t } = useTranslation();

  const getContent = () => {
    switch (errorCode) {
      case 'LIMIT_EXCEEDED_ANON':
        return {
          title: t('rateLimit.exceeded'),
          description: t('rateLimit.linkDiscordAuthDesc'),
          buttonText: t('auth.signIn'),
          buttonIcon: LogIn,
          action: onLogin
        };
      case 'LIMIT_EXCEEDED_AUTH':
        return {
          title: t('rateLimit.exceeded'),
          description: t('rateLimit.linkDiscordDesc'),
          buttonText: t('publishedModpacks.auth.signIn'),
          buttonIcon: Link,
          action: onLinkDiscord
        };
      default:
        return {
          title: t('rateLimit.exceeded'),
          description: t('rateLimit.limitReached', { limit }),
          buttonText: t('common.close'),
          buttonIcon: X,
          action: onClose
        };
    }
  };

  const content = getContent();
  const Icon = content.buttonIcon;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-gray-900 border border-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-white mb-2"
                >
                  {content.title}
                </Dialog.Title>
                <div className="mt-2">
                  <p className="text-sm text-gray-300 mb-4">
                    {content.description}
                  </p>

                  {(errorCode === 'LIMIT_EXCEEDED_ANON' || errorCode === 'LIMIT_EXCEEDED_AUTH') && (
                    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 mb-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-400">{t('rateLimit.currentLimit')}</span>
                        <span className="text-white font-medium">{limit}/h</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-indigo-400 font-medium">Discord</span>
                        <span className="text-indigo-400 font-bold">50/h</span>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    {t('rateLimit.resetIn')} {new Date(resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                    onClick={onClose}
                  >
                    {t('common.close')}
                  </button>
                  {content.action !== onClose && (
                    <button
                      type="button"
                      className="inline-flex justify-center items-center gap-2 rounded-md border border-transparent bg-lumina-600 px-4 py-2 text-sm font-medium text-white hover:bg-lumina-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-lumina-500 focus-visible:ring-offset-2"
                      onClick={() => {
                        content.action?.();
                        onClose();
                      }}
                    >
                      <Icon className="w-4 h-4" />
                      {content.buttonText}
                    </button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
