import type { Address } from 'ox'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { TokenIcon } from '#comps/TokenIcon'
import { supportedLanguages } from '#lib/i18n'
import { cx } from '#lib/css'
import { useRovingTabIndex } from '#lib/a11y'
import ChevronRightIcon from '~icons/lucide/chevron-right'

type AssetData = {
	address: Address.Address
	metadata:
		| { name?: string; symbol?: string; decimals?: number; priceUsd?: number }
		| undefined
	balance: string | undefined
	valueUsd: number | undefined
}

type SettingsProps = {
	assets: AssetData[]
	currentFeeToken: string
	onFeeTokenChange: (address: string) => void
	currentLanguage: string
	onLanguageChange: (lang: string) => void
	onViewChange?: (view: SettingsView) => void
	externalNavigateBack?: boolean
}

export type SettingsView = 'main' | 'feeToken' | 'language'

export const SETTINGS_VIEW_TITLES: Record<SettingsView, string> = {
	main: 'settings.title',
	feeToken: 'settings.feeToken',
	language: 'settings.language',
}

const LANGUAGES = supportedLanguages

function shortenAddress(address: string, chars = 4): string {
	return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

export function Settings({
	assets,
	currentFeeToken,
	onFeeTokenChange,
	currentLanguage,
	onLanguageChange,
	onViewChange,
	externalNavigateBack,
}: SettingsProps) {
	const { t } = useTranslation()
	const [currentView, setCurrentView] = React.useState<SettingsView>('main')
	const [slideDirection, setSlideDirection] = React.useState<
		'forward' | 'backward'
	>('forward')

	const assetsWithBalance = assets.filter((a) => a.balance && a.balance !== '0')
	const currentFeeAsset = assetsWithBalance.find(
		(a) => a.address === currentFeeToken,
	)
	const currentLangObj = LANGUAGES.find((l) => l.code === currentLanguage)

	const mainMenuRoving = useRovingTabIndex<HTMLButtonElement>(2)
	const feeTokenRoving = useRovingTabIndex<HTMLButtonElement>(
		assetsWithBalance.length,
	)
	const languageRoving = useRovingTabIndex<HTMLButtonElement>(LANGUAGES.length)

	const navigateTo = (view: SettingsView) => {
		setSlideDirection('forward')
		setCurrentView(view)
		onViewChange?.(view)
	}

	const navigateBack = React.useCallback(() => {
		setSlideDirection('backward')
		setCurrentView('main')
		onViewChange?.('main')
	}, [onViewChange])

	React.useEffect(() => {
		if (externalNavigateBack && currentView !== 'main') {
			navigateBack()
		}
	}, [externalNavigateBack, currentView, navigateBack])

	return (
		<div className="relative overflow-hidden">
			{/* Main Menu */}
			<div
				className={cx(
					'transition-transform duration-300 ease-out',
					currentView === 'main'
						? 'translate-x-0'
						: slideDirection === 'forward'
							? '-translate-x-full'
							: 'translate-x-full',
					currentView !== 'main' && 'absolute inset-0 pointer-events-none',
				)}
				role="menu"
				aria-label={t('settings.title')}
			>
				<div className="flex flex-col -mx-2">
					<button
						type="button"
						role="menuitem"
						ref={mainMenuRoving.setItemRef(0)}
						tabIndex={mainMenuRoving.getTabIndex(0)}
						onClick={() => navigateTo('feeToken')}
						onKeyDown={(e) => mainMenuRoving.handleKeyDown(e, 0)}
						aria-label={t('settings.feeToken')}
						className="flex items-center gap-2.5 px-3 h-[48px] rounded-xl hover:glass-thin transition-all cursor-pointer focus-ring"
					>
						<span className="flex flex-col flex-1 min-w-0 text-left">
							<span className="text-[13px] text-primary font-medium">
								{t('settings.feeToken')}
							</span>
							<span className="text-[11px] text-tertiary">
								{currentFeeAsset?.metadata?.symbol ||
									(currentFeeToken
										? shortenAddress(currentFeeToken, 3)
										: t('settings.notSet'))}
							</span>
						</span>
						<ChevronRightIcon className="size-[16px] text-tertiary" />
					</button>
					<button
						type="button"
						role="menuitem"
						ref={mainMenuRoving.setItemRef(1)}
						tabIndex={mainMenuRoving.getTabIndex(1)}
						onClick={() => navigateTo('language')}
						onKeyDown={(e) => mainMenuRoving.handleKeyDown(e, 1)}
						aria-label={t('settings.language')}
						className="flex items-center gap-2.5 px-3 h-[48px] rounded-xl hover:glass-thin transition-all cursor-pointer focus-ring"
					>
						<span className="flex flex-col flex-1 min-w-0 text-left">
							<span className="text-[13px] text-primary font-medium">
								{t('settings.language')}
							</span>
							<span className="text-[11px] text-tertiary">
								{currentLangObj?.name ||
									LANGUAGES.find((l) => l.code === 'en')?.name ||
									'English'}
							</span>
						</span>
						<ChevronRightIcon className="size-[16px] text-tertiary" />
					</button>
				</div>
			</div>

			{/* Fee Token Submenu */}
			<div
				className={cx(
					'transition-transform duration-300 ease-out',
					currentView === 'feeToken'
						? 'translate-x-0'
						: slideDirection === 'forward'
							? 'translate-x-full'
							: '-translate-x-full',
					currentView !== 'feeToken' && 'absolute inset-0 pointer-events-none',
				)}
				role="menu"
				aria-label={t('settings.feeToken')}
			>
				<div className="flex flex-col -mx-2">
					<p className="text-[13px] text-secondary px-3 py-2">
						{t('settings.feeTokenDescription')}
					</p>
					{assetsWithBalance.length === 0 ? (
						<div className="text-[13px] text-secondary py-4 text-center">
							<p>{t('common.noTokensForFees')}</p>
						</div>
					) : (
						assetsWithBalance.map((asset, index) => {
							const isCurrent = currentFeeToken === asset.address
							return (
								<div
									key={asset.address}
									role="menuitem"
									className="flex items-center gap-2.5 px-3 h-[48px] rounded-xl hover:glass-thin transition-all"
								>
									<TokenIcon address={asset.address} className="size-[28px]" />
									<span className="flex flex-col flex-1 min-w-0">
										<span className="text-[13px] text-primary font-medium truncate">
											{asset.metadata?.name || shortenAddress(asset.address)}
										</span>
										<span className="text-[11px] text-tertiary font-mono">
											{asset.metadata?.symbol ||
												shortenAddress(asset.address, 3)}
										</span>
									</span>
									{isCurrent ? (
										<span className="text-[11px] font-medium bg-positive/10 text-positive rounded px-1.5 py-0.5 text-center">
											{t('common.active')}
										</span>
									) : (
										<button
											type="button"
											ref={feeTokenRoving.setItemRef(index)}
											tabIndex={feeTokenRoving.getTabIndex(index)}
											onKeyDown={(e) => feeTokenRoving.handleKeyDown(e, index)}
											onClick={() => onFeeTokenChange(asset.address)}
											aria-label={t('common.setToken', {
												token:
													asset.metadata?.name || shortenAddress(asset.address),
											})}
											className="text-[11px] font-medium bg-accent/10 text-accent rounded px-1.5 py-0.5 text-center cursor-pointer press-down hover:bg-accent/20 transition-colors focus-ring"
										>
											{t('common.set')}
										</button>
									)}
								</div>
							)
						})
					)}
				</div>
			</div>

			{/* Language Submenu */}
			<div
				className={cx(
					'transition-transform duration-300 ease-out',
					currentView === 'language'
						? 'translate-x-0'
						: slideDirection === 'forward'
							? 'translate-x-full'
							: '-translate-x-full',
					currentView !== 'language' && 'absolute inset-0 pointer-events-none',
				)}
				role="menu"
				aria-label={t('settings.language')}
			>
				<div className="flex flex-col -mx-2">
					<p className="text-[13px] text-secondary px-3 py-2">
						{t('settings.languageDescription')}
					</p>
					{LANGUAGES.map((lang, index) => {
						const isCurrent = currentLanguage === lang.code
						return (
							<div
								key={lang.code}
								role="menuitem"
								className="flex items-center gap-2.5 px-3 h-[48px] rounded-xl hover:glass-thin transition-all"
							>
								<span className="flex flex-col flex-1 min-w-0">
									<span className="text-[13px] text-primary font-medium">
										{lang.name}
									</span>
								</span>
								{isCurrent ? (
									<span className="text-[11px] font-medium bg-positive/10 text-positive rounded px-1.5 py-0.5 text-center">
										{lang.active}
									</span>
								) : (
									<button
										type="button"
										ref={languageRoving.setItemRef(index)}
										tabIndex={languageRoving.getTabIndex(index)}
										onKeyDown={(e) => languageRoving.handleKeyDown(e, index)}
										onClick={() => onLanguageChange(lang.code)}
										aria-label={t('settings.setLanguage', {
											language: lang.name,
										})}
										className="text-[11px] font-medium bg-accent/10 text-accent rounded px-1.5 py-0.5 text-center cursor-pointer press-down hover:bg-accent/20 transition-colors focus-ring"
									>
										{lang.set}
									</button>
								)}
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
