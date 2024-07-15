import {
  type ChangeEventHandler,
  type FC,
  Suspense,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Box,
  BoxPadded,
  BoxSize,
  Flex,
  FlexAlignItems,
  FlexJustifyContent,
} from '@xorkevin/nuke/component/box';
import {Field, Select} from '@xorkevin/nuke/component/form';
import {NavBar, NavClasses} from '@xorkevin/nuke/component/nav';
import {
  ColorScheme,
  TextClasses,
  useColorScheme,
} from '@xorkevin/nuke/component/text';
import {
  classNames,
  isNil,
  isNonNil,
  isObject,
  isSignalAborted,
  modClassNames,
  parseJSON,
  valToEnum,
} from '@xorkevin/nuke/computil';
import {WS} from '@xorkevin/nuke/net';
import {type Route, Routes} from '@xorkevin/nuke/router';

import styles from './app.module.css';

import {WSContext} from '@/net/ws.js';

const fallbackView = <div>Loading</div>;

const routes: Route[] = [
  {
    path: '',
    exact: true,
    component: lazy(async () => await import('./container/home.js')),
  },
];

const WSStatus = () => {
  const {ws, pingRef} = useContext(WSContext);
  const [wsStatus, setWSStatus] = useState(false);
  const [wsPing, setWSPing] = useState<number | undefined>(undefined);
  const lastPing = useRef<{id: string; at: number} | undefined>(undefined);
  const sendPing = useCallback(() => {
    if (!ws.isOpen()) {
      return;
    }
    const id = crypto.randomUUID();
    ws.send(
      JSON.stringify({
        id,
        ch: '_ctl_',
        v: {
          ops: [{op: 'ping'}],
        },
      }),
    );
    lastPing.current = {id, at: performance.now()};
  }, [ws, lastPing]);

  useEffect(() => {
    setWSStatus(ws.isOpen());

    const controller = new AbortController();

    let timer: number | undefined;
    ws.addEventListener(
      'open',
      () => {
        setWSStatus(true);
        lastPing.current = undefined;
        if (isNonNil(timer)) {
          clearInterval(timer);
          timer = undefined;
        }
        sendPing();
        timer = setInterval(() => {
          if (isNonNil(lastPing.current)) {
            setWSPing(-1);
            pingRef.current = -1;
            lastPing.current = undefined;
          }
          sendPing();
        }, 5000);
      },
      {signal: controller.signal},
    );
    ws.addEventListener(
      'close',
      () => {
        setWSStatus(false);
        setWSPing(undefined);
        pingRef.current = undefined;
        lastPing.current = undefined;
        if (isNonNil(timer)) {
          clearInterval(timer);
          timer = undefined;
        }
      },
      {signal: controller.signal},
    );

    ws.addEventListener(
      'message',
      (ev: MessageEvent<string>) => {
        const data = parseJSON(ev.data);
        if (
          !isObject(data) ||
          !('id' in data) ||
          !('ch' in data) ||
          !('v' in data) ||
          isNil(lastPing.current) ||
          data.id !== lastPing.current.id ||
          data.ch !== '_ctl_' ||
          !isObject(data.v) ||
          !('d' in data.v) ||
          typeof data.v.d !== 'number'
        ) {
          return;
        }
        const ping = Math.max(
          Math.ceil(performance.now() - lastPing.current.at - data.v.d),
          1,
        );
        setWSPing(ping);
        pingRef.current = ping;
        lastPing.current = undefined;
      },
      {signal: controller.signal},
    );

    void (async () => {
      await ws.waitDisconnected({signal: controller.signal});
      if (isSignalAborted(controller.signal)) {
        return;
      }
      ws.connect(controller.signal);
    })();

    return () => {
      controller.abort();
      if (isNonNil(timer)) {
        clearInterval(timer);
      }
    };
  }, [ws, setWSStatus, lastPing, sendPing, setWSPing, pingRef]);

  return (
    <Flex alignItems={FlexAlignItems.Center} gap="8px">
      <div
        className={modClassNames(styles, {
          'ws-indicator': true,
          'ws-connected': wsStatus,
        })}
      />
      <code>
        ping: {isNil(wsPing) ? '-' : wsPing < 0 ? '>5000' : String(wsPing)}
        ms
      </code>
    </Flex>
  );
};

const App: FC = () => {
  const {colorScheme, setColorScheme} = useColorScheme();
  const onColorSchemeChange = useCallback<
    ChangeEventHandler<HTMLSelectElement>
  >(
    (e) => {
      setColorScheme(
        valToEnum(ColorScheme, e.target.value) ?? ColorScheme.System,
      );
    },
    [setColorScheme],
  );
  const ws = useMemo(() => {
    const ws = new WS('ws://localhost:3000/api/ws', [
      'xorkevin.dev-arcade.v1alpha1',
    ]);
    return ws;
  }, []);
  const pingRef = useRef<number | undefined>(undefined);
  const wsctx = useMemo(() => ({ws, pingRef}), [ws, pingRef]);
  return (
    <WSContext.Provider value={wsctx}>
      <div>
        <header className={NavClasses.Banner}>
          <Box
            size={BoxSize.S6}
            padded={BoxPadded.LR}
            center
            className={NavClasses.BannerItem}
          >
            <Flex
              justifyContent={FlexJustifyContent.SpaceBetween}
              alignItems={FlexAlignItems.Stretch}
              className={classNames(NavClasses.BannerItem)}
            >
              <Flex
                alignItems={FlexAlignItems.Stretch}
                className={classNames(NavClasses.BannerItem)}
                gap="16px"
              >
                <Flex
                  alignItems={FlexAlignItems.Center}
                  className={TextClasses.TitleSmall}
                >
                  Arcade
                </Flex>
                <NavBar matchesAriaCurrent="page" aria-label="Site navigation">
                  <NavBar.Link href="" exact>
                    Home
                  </NavBar.Link>
                </NavBar>
              </Flex>
              <Field>
                <Flex alignItems={FlexAlignItems.Center} gap="16px">
                  <WSStatus />
                  <Select
                    name="scheme"
                    value={colorScheme}
                    onChange={onColorSchemeChange}
                  >
                    <option value={ColorScheme.System}>System</option>
                    <option value={ColorScheme.Light}>Light</option>
                    <option value={ColorScheme.Dark}>Dark</option>
                  </Select>
                </Flex>
              </Field>
            </Flex>
          </Box>
        </header>
        <main>
          <Suspense fallback={fallbackView}>
            <Routes routes={routes} />
          </Suspense>
        </main>
      </div>
    </WSContext.Provider>
  );
};

export default App;
