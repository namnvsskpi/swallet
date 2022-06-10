import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import DefaultTabBar from 'react-native-scrollable-tab-view/DefaultTabBar';
import { baseStyles, fontStyles } from '../../../styles/common';
import AccountOverview from '../../UI/AccountOverview';
import Tokens from '../../UI/Tokens';
import { getWalletNavbarOptions } from '../../UI/Navbar';
import { strings } from '../../../../locales/i18n';
import {
  hexToBN,
  renderFromTokenMinimalUnit,
  renderFromWei,
  weiToFiat,
} from '../../../util/number';
import Engine from '../../../core/Engine';
import Analytics from '../../../core/Analytics';
import { ANALYTICS_EVENT_OPTS } from '../../../util/analytics';
import OnboardingWizard from '../../UI/OnboardingWizard';
import ErrorBoundary from '../ErrorBoundary';
import { DrawerContext } from '../../Nav/Main/MainNavigator';
import { mockTheme, useAppThemeFromContext } from '../../../util/theme';
import SWallet from '../../../constants/address';
import AnalyticsV2 from '../../../util/analyticsV2';
import Networks from '../../../util/networks';
import { RINKEBY } from '../../../constants/network';
import { getTicker } from '../../../util/transactions';

const createStyles = (colors: any) =>
  StyleSheet.create({
    wrapper: {
      flex: 1,
      backgroundColor: colors.background.default,
      // height: 600,
    },
    tabUnderlineStyle: {
      height: 2,
      backgroundColor: colors.primary.default,
    },
    tabStyle: {
      paddingBottom: 0,
    },
    tabBar: {
      borderColor: colors.border.muted,
    },
    textStyle: {
      fontSize: 12,
      letterSpacing: 0.5,
      ...(fontStyles.bold as any),
    },
    loader: {
      backgroundColor: colors.background.default,
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

/**
 * Main view for the wallet
 */
const Wallet = ({ navigation }: any) => {
  const { drawerRef } = useContext(DrawerContext);
  const [refreshing, setRefreshing] = useState(false);
  const accountOverviewRef = useRef(null);
  const { colors } = useAppThemeFromContext() || mockTheme;
  const styles = createStyles(colors);
  const { TokensController, NetworkController, CurrencyRateController } =
    Engine.context;
  /**
   * Map of accounts to information objects including balances
   */
  const accounts = useSelector(
    (state: any) =>
      state.engine.backgroundState.AccountTrackerController.accounts,
  );
  /**
   * ETH to current currency conversion rate
   */
  const conversionRate = useSelector(
    (state: any) =>
      state.engine.backgroundState.CurrencyRateController.conversionRate,
  );

  const tokenBalances = useSelector(
    (state: any) =>
      state.engine.backgroundState.TokenBalancesController.contractBalances,
  );
  /**
   * Currency code of the currently-active currency
   */
  const currentCurrency = useSelector(
    (state: any) =>
      state.engine.backgroundState.CurrencyRateController.currentCurrency,
  );
  /**
   * An object containing each identity in the format address => account
   */
  const identities = useSelector(
    (state: any) =>
      state.engine.backgroundState.PreferencesController.identities,
  );
  /**
   * A string that represents the selected address
   */
  const selectedAddress = useSelector(
    (state: any) =>
      state.engine.backgroundState.PreferencesController.selectedAddress,
  );
  /**
   * An array that represents the user tokens
   */
  const tokens = useSelector(
    (state: any) => state.engine.backgroundState.TokensController.tokens,
  );
  /**
   * Current provider ticker
   */
  const ticker = useSelector(
    (state: any) =>
      state.engine.backgroundState.NetworkController.provider.ticker,
  );
  /**
   * Current onboarding wizard step
   */
  const wizardStep = useSelector((state: any) => state.wizard.step);

  const { colors: themeColors } = useAppThemeFromContext() || mockTheme;

  useEffect(
    () => {
      requestAnimationFrame(async () => {
        const {
          TokenDetectionController,
          CollectibleDetectionController,
          AccountTrackerController,
        } = Engine.context as any;
        TokenDetectionController.detectTokens();
        CollectibleDetectionController.detectCollectibles();
        AccountTrackerController.refresh();
      });
    },
    /* eslint-disable-next-line */
    [navigation],
  );

  useEffect(() => {
    navigation.setOptions(
      getWalletNavbarOptions(
        'wallet.title',
        navigation,
        drawerRef,
        themeColors,
      ),
    );
    /* eslint-disable-next-line */
  }, [navigation, themeColors]);

  const onRefresh = useCallback(async () => {
    requestAnimationFrame(async () => {
      setRefreshing(true);
      const {
        TokenDetectionController,
        CollectibleDetectionController,
        AccountTrackerController,
        CurrencyRateController,
        TokenRatesController,
      } = Engine.context as any;
      const actions = [
        TokenDetectionController.detectTokens(),
        CollectibleDetectionController.detectCollectibles(),
        AccountTrackerController.refresh(),
        CurrencyRateController.start(),
        TokenRatesController.poll(),
      ];
      await Promise.all(actions);
      setRefreshing(false);
    });
  }, [setRefreshing]);

  const renderTabBar = useCallback(
    () => (
      <DefaultTabBar
        underlineStyle={styles.tabUnderlineStyle}
        activeTextColor={colors.primary.default}
        inactiveTextColor={colors.text.muted}
        backgroundColor={colors.background.default}
        tabStyle={styles.tabStyle}
        textStyle={styles.textStyle}
        style={styles.tabBar}
      />
    ),
    [styles, colors],
  );

  const onChangeTab = useCallback((obj) => {
    InteractionManager.runAfterInteractions(() => {
      if (obj.ref.props.tabLabel === strings('wallet.tokens')) {
        Analytics.trackEvent(ANALYTICS_EVENT_OPTS.WALLET_TOKENS);
      } else {
        Analytics.trackEvent(ANALYTICS_EVENT_OPTS.WALLET_COLLECTIBLES);
      }
    });
  }, []);

  const onRef = useCallback((ref) => {
    accountOverviewRef.current = ref;
  }, []);

  const renderContent = useCallback(() => {
    let balance: any = 0;
    let assets = tokens;

    if (accounts[selectedAddress]) {
      if (!assets.find((asset: any) => asset?.address === SWallet.contract)) {
        TokensController.addToken(
          SWallet.contract,
          SWallet.symbol,
          SWallet.decimals,
        );
      }
      // // balance = renderFromWei(accounts[selectedAddress].balance);
      // console.log(tokenBalances);
      const totalToken: number = +renderFromTokenMinimalUnit(
        tokenBalances[SWallet.contract],
        +SWallet.decimals,
      );
      const price = (conversionRate * totalToken || 0) / 40000;

      const sToken = {
        name: 'SCOIN',
        address: SWallet.contract,
        balanceError: null,
        decimals: SWallet.decimals,
        image: 'https://i.ibb.co/RgB8HR0/SCOIN.png',
        isERC721: false,
        symbol: SWallet.symbol,
        balance,
        balanceFiat: `$${price.toFixed(2)}`,
      };
      assets = [
        // {
        //   name: 'Ether', // FIXME: use 'Ether' for mainnet only, what should it be for custom networks?
        //   symbol: getTicker(ticker),
        //   isETH: true,
        //   balance,
        //   balanceFiat: weiToFiat(
        //     hexToBN(accounts[selectedAddress].balance) as any,
        //     conversionRate,
        //     currentCurrency,
        //   ),
        //   logo: '../images/eth-logo.png',
        // },
        sToken,
        // ...(tokens || []),
      ];
    } else {
      assets = tokens;
    }

    const account = {
      address: selectedAddress,
      ...identities[selectedAddress],
      ...accounts[selectedAddress],
    };

    return (
      <View style={styles.wrapper}>
        <AccountOverview
          account={account}
          navigation={navigation}
          onRef={onRef}
        />
        <Tokens
          // tabLabel={strings('wallet.tokens')}
          key={'tokens-tab'}
          navigation={navigation}
          tokens={assets}
        />
      </View>
    );
  }, [
    tokens,
    accounts,
    selectedAddress,
    identities,
    styles.wrapper,
    navigation,
    onRef,
    conversionRate,
    currentCurrency,
    TokensController,
  ]);

  const renderLoader = useCallback(
    () => (
      <View style={styles.loader}>
        <ActivityIndicator size="small" />
      </View>
    ),
    [styles],
  );

  /**
   * Return current step of onboarding wizard if not step 5 nor 0
   */
  const renderOnboardingWizard = useCallback(
    () =>
      [1, 2, 3, 4].includes(wizardStep) && (
        <OnboardingWizard
          navigation={navigation}
          coachmarkRef={accountOverviewRef.current}
        />
      ),
    [navigation, wizardStep],
  );

  useEffect(() => {
    CurrencyRateController.setNativeCurrency('ETH');
    NetworkController.setProviderType(RINKEBY);

    setTimeout(() => {
      Engine.refreshTransactionHistory();
    }, 1000);
  }, []);

  return (
    <ErrorBoundary view="Wallet">
      <View style={baseStyles.flexGrow} testID={'wallet-screen'}>
        <ScrollView
          style={styles.wrapper}
          refreshControl={
            <RefreshControl
              colors={[colors.primary.default]}
              tintColor={colors.icon.default}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
        >
          {selectedAddress ? renderContent() : renderLoader()}
        </ScrollView>
        {renderOnboardingWizard()}
      </View>
    </ErrorBoundary>
  );
};

export default Wallet;
