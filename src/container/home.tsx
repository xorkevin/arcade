import {type FC, useCallback, useEffect, useRef, useState} from 'react';

import {
  Box,
  BoxSize,
  Flex,
  FlexAlignItems,
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
  type Result,
  isNil,
  isNonNil,
  isResOk,
  isSignalAborted,
  parseURL,
  useDebounceCallback,
} from '@xorkevin/nuke/computil';

const formInitState = () => ({search: ''});

const Search: FC = () => {
  const form = useForm(formInitState);

  const formState = useRef(form.state);
  formState.current = form.state;

  const [searchRes, setSearchRes] = useState<Result<string, Error> | undefined>(
    undefined,
  );

  const search = useDebounceCallback(
    useCallback(
      async (signal: AbortSignal) => {
        const u = parseURL(
          `/fs/${formState.current.search}`,
          window.location.origin,
        );
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
          setSearchRes({value: JSON.stringify(body, undefined, '  ')});
        } catch (err) {
          if (isSignalAborted(signal)) {
            return;
          }
          setSearchRes({
            err: new Error('Failed to search content', {cause: err}),
          });
        }
      },
      [formState, setSearchRes],
    ),
    250,
  );

  const handleSubmit = useCallback(() => {
    search();
  }, [search]);

  return (
    <Flex dir={FlexDir.Col} gap="16px">
      <Form form={form} onSubmit={handleSubmit}>
        <Flex dir={FlexDir.Col} alignItems={FlexAlignItems.Start} gap="16px">
          <Field>
            <Flex dir={FlexDir.Col}>
              <Label>Search</Label>
              <Input name="search" />
            </Flex>
          </Field>
          <ButtonGroup gap>
            <Button variant={ButtonVariant.Primary} type="submit">
              Search
            </Button>
          </ButtonGroup>
        </Flex>
      </Form>
      {isNonNil(searchRes) && (
        <pre>
          {isResOk(searchRes) ? searchRes.value : searchRes.err.toString()}
        </pre>
      )}
    </Flex>
  );
};

const fsOrigin = ARCADE_FS_ORIGIN;

const videoInitState = () => ({video: ''});

const Video: FC = () => {
  const form = useForm(videoInitState);

  const formState = useRef(form.state);
  formState.current = form.state;

  const [videoURL, setVideoURL] = useState('');

  const loadVideo = useDebounceCallback(
    useCallback(() => {
      const u = parseURL(`/fs/${formState.current.video}`, fsOrigin);
      if (isNil(u)) {
        return;
      }
      setVideoURL(u.toString());
    }, [formState, setVideoURL]),
    250,
  );

  const handleSubmit = useCallback(() => {
    loadVideo();
  }, [loadVideo]);

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
    }
    return () => {
      controller.abort();
    };
  }, [videoElem]);

  return (
    <Flex dir={FlexDir.Col} gap="16px">
      <Form form={form} onSubmit={handleSubmit}>
        <Flex dir={FlexDir.Col} alignItems={FlexAlignItems.Start} gap="16px">
          <Field>
            <Flex dir={FlexDir.Col}>
              <Label>Video</Label>
              <Input name="video" />
            </Flex>
          </Field>
          <ButtonGroup gap>
            <Button variant={ButtonVariant.Primary} type="submit">
              Load
            </Button>
          </ButtonGroup>
        </Flex>
      </Form>
      <video
        ref={videoElem}
        src={videoURL.length > 0 ? videoURL : undefined}
        controls
        crossOrigin="anonymous"
      />
    </Flex>
  );
};

const Home: FC = () => {
  return (
    <Box size={BoxSize.S6} center>
      <Search />
      <Video />
    </Box>
  );
};

export default Home;
