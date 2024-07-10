import {type FC, useCallback, useEffect, useRef, useState} from 'react';

import {
  Box,
  BoxSize,
  Flex,
  FlexAlignItems,
  FlexClasses,
  FlexDir,
} from '@xorkevin/nuke/component/box';
import {
  Button,
  ButtonGroup,
  ButtonVariant,
} from '@xorkevin/nuke/component/button';
import {
  Field,
  Form,
  Input,
  Label,
  useForm,
} from '@xorkevin/nuke/component/form';
import {
  isArray,
  isNil,
  isNonNil,
  isSignalAborted,
  modClassNames,
  parseURL,
  useDebounceCallback,
} from '@xorkevin/nuke/computil';

import styles from './home.module.css';

type DirEntry = {name: string; dir?: boolean};
type SearchRes = {
  entries: DirEntry[];
  searchDir: string;
};

type SearchListEntryFileProps = {
  name: string;
  searchDir: string;
  load: (v: string) => void;
};

const SearchListEntryFile: FC<SearchListEntryFileProps> = ({
  name,
  searchDir,
  load,
}) => {
  const handleClick = useCallback(() => {
    load(`${searchDir.length > 0 ? `${searchDir}/` : ''}${name}`);
  }, [load, searchDir, name]);
  return (
    <li>
      <Button variant={ButtonVariant.Subtle} onClick={handleClick}>
        {name}
      </Button>
    </li>
  );
};

const ChevronRight = () => (
  <svg
    aria-hidden={true}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    fill="none"
  >
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

type SearchListEntryDirProps = {
  name: string;
  searchDir: string;
  search: (v: string) => void;
};

const SearchListEntryDir: FC<SearchListEntryDirProps> = ({
  name,
  searchDir,
  search,
}) => {
  const handleClick = useCallback(() => {
    search(`${searchDir.length > 0 ? `${searchDir}/` : ''}${name}`);
  }, [search, searchDir, name]);
  return (
    <li>
      <Button variant={ButtonVariant.Subtle} onClick={handleClick}>
        {name} <ChevronRight />
      </Button>
    </li>
  );
};

type SearchListEntryProps = {
  entry: DirEntry;
  searchDir: string;
  search: (v: string) => void;
  load: (v: string) => void;
};

const SearchListEntry: FC<SearchListEntryProps> = ({
  entry,
  searchDir,
  search,
  load,
}) => {
  return (
    <li>
      {entry.dir === true ? (
        <SearchListEntryDir
          name={entry.name}
          searchDir={searchDir}
          search={search}
        />
      ) : (
        <SearchListEntryFile
          name={entry.name}
          searchDir={searchDir}
          load={load}
        />
      )}
    </li>
  );
};

const ChevronLeft = () => (
  <svg
    aria-hidden={true}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    fill="none"
  >
    <polyline points="16 6 10 12 16 18" />
  </svg>
);

type SearchListProps = {
  searchRes: SearchRes;
  search: (v: string) => void;
  load: (v: string) => void;
};

const SearchList: FC<SearchListProps> = ({searchRes, search, load}) => {
  const handleHome = useCallback(() => {
    search('');
  }, [search]);

  const searchDir = searchRes.searchDir;
  const handleBack = useCallback(() => {
    const idx = searchDir.lastIndexOf('/');
    if (idx >= 0) {
      search(searchDir.slice(0, idx));
    } else {
      search('');
    }
  }, [searchDir, search]);

  return (
    <Flex dir={FlexDir.Col} gap="16px">
      <ButtonGroup gap>
        <Button variant={ButtonVariant.Subtle} onClick={handleHome}>
          Home
        </Button>
        {searchDir.length > 0 && (
          <Button variant={ButtonVariant.Subtle} onClick={handleBack}>
            <ChevronLeft /> Back
          </Button>
        )}
      </ButtonGroup>
      <ul className={modClassNames(styles, 'searchlist')}>
        {searchRes.entries.map((v) => (
          <SearchListEntry
            key={v.name}
            entry={v}
            searchDir={searchRes.searchDir}
            search={search}
            load={load}
          />
        ))}
      </ul>
    </Flex>
  );
};

const formInitState = () => ({search: ''});

type SearchProps = {
  load: (v: string) => void;
};

const Search: FC<SearchProps> = ({load}) => {
  const form = useForm(formInitState);

  const [searchRes, setSearchRes] = useState<SearchRes | undefined>(undefined);

  const search = useDebounceCallback(
    useCallback(
      async (signal: AbortSignal, searchDir: string) => {
        const u = parseURL(`/fs/${searchDir}`, window.location.origin);
        if (isNil(u)) {
          return;
        }
        const params = new URLSearchParams({
          dir: 't',
        });
        u.search = params.toString();
        try {
          const res = await fetch(u);
          if (isSignalAborted(signal)) {
            return;
          }
          const body = (await res.json()) as unknown;
          if (
            typeof body !== 'object' ||
            isNil(body) ||
            !('entries' in body) ||
            !isArray(body.entries) ||
            body.entries.some(
              (v) =>
                typeof v !== 'object' ||
                isNil(v) ||
                !('name' in v) ||
                typeof v.name !== 'string' ||
                ('dir' in v && typeof v.dir !== 'boolean'),
            )
          ) {
            console.error('Invalid search response', {
              cause: body,
            });
            return;
          }
          setSearchRes({
            entries: body.entries as DirEntry[],
            searchDir,
          });
        } catch (err) {
          console.error('Failed to search content', {cause: err});
          if (isSignalAborted(signal)) {
            return;
          }
        }
      },
      [setSearchRes],
    ),
    250,
  );

  const submitArgs = useRef(form.state.search);
  submitArgs.current = form.state.search;
  const handleSubmit = useCallback(() => {
    search(undefined, submitArgs.current);
  }, [search, submitArgs]);

  const formUpdate = form.update;
  const formUpdateSearch = useCallback(
    (v: string) => {
      formUpdate('search', v);
      search(undefined, v);
    },
    [formUpdate, search],
  );

  return (
    <Flex dir={FlexDir.Col} gap="16px">
      <Form form={form} onSubmit={handleSubmit}>
        <Flex alignItems={FlexAlignItems.Start} gap="8px">
          <Field>
            <Flex className={FlexClasses.Grow}>
              <Label>Search</Label>
              <Input name="search" className={FlexClasses.Grow} />
            </Flex>
          </Field>
          <ButtonGroup gap>
            <Button variant={ButtonVariant.Primary} type="submit">
              <ChevronRight />
            </Button>
          </ButtonGroup>
        </Flex>
      </Form>
      {isNonNil(searchRes) && (
        <SearchList
          searchRes={searchRes}
          search={formUpdateSearch}
          load={load}
        />
      )}
    </Flex>
  );
};

type VideoProps = {
  videoURL: string;
};

const Video: FC<VideoProps> = ({videoURL}) => {
  const videoElem = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (isNonNil(videoElem.current)) {
      videoElem.current.addEventListener(
        'error',
        () => {
          console.error('Video resource error', {
            cause: videoElem.current?.error,
          });
        },
        {signal: controller.signal},
      );
      videoElem.current.addEventListener(
        'abort',
        () => {
          console.error('Video resource abort', {
            cause: videoElem.current?.error,
          });
        },
        {signal: controller.signal},
      );
    }
    return () => {
      controller.abort();
    };
  }, [videoElem]);

  return (
    <video
      ref={videoElem}
      src={videoURL.length > 0 ? videoURL : undefined}
      controls={videoURL.length > 0}
      muted
    />
  );
};

const fsOrigin = ARCADE_FS_ORIGIN;

const Home: FC = () => {
  const [videoURL, setVideoURL] = useState('');

  const loadVideo = useDebounceCallback(
    useCallback(
      (_signal: AbortSignal, video: string) => {
        const u = parseURL(`/fs/${video}`, fsOrigin);
        if (isNil(u)) {
          return;
        }
        setVideoURL(u.toString());
      },
      [setVideoURL],
    ),
    250,
  );

  const load = useCallback(
    (video: string) => {
      loadVideo(undefined, video);
    },
    [loadVideo],
  );

  return (
    <Box size={BoxSize.S6} center padded>
      <Flex dir={FlexDir.Col} gap="16px">
        {videoURL.length > 0 && <Video videoURL={videoURL} />}
        <Search load={load} />
      </Flex>
    </Box>
  );
};

export default Home;
