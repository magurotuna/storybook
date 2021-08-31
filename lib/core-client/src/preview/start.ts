import { ClientApi } from '@storybook/client-api';
import { WebGlobalAnnotations, WebPreview } from '@storybook/web-preview';
import { Framework } from '@storybook/csf';
import createChannel from '@storybook/channel-postmessage';
import { addons } from '@storybook/addons';
import Events from '@storybook/core-events';
import { Path } from '@storybook/store';

import { Loadable } from './types';
import { executeLoadableForChanges } from './executeLoadable';

export function start<TFramework extends Framework>(
  renderToDOM: WebGlobalAnnotations<TFramework>['renderToDOM'],
  { decorateStory }: { decorateStory?: WebGlobalAnnotations<TFramework>['applyDecorators'] } = {}
) {
  const channel = createChannel({ page: 'preview' });
  addons.setChannel(channel);

  let preview: WebPreview<TFramework>;
  const clientApi = new ClientApi<TFramework>();

  return {
    forceReRender: () => channel.emit(Events.FORCE_RE_RENDER),
    getStorybook: (): void[] => [],
    raw: (): void => {},

    clientApi,
    // This gets called each time the user calls configure (i.e. once per HMR)
    // The first time, it constructs the preview, subsequently it updates it
    async configure(framework: string, loadable: Loadable, m?: NodeModule) {
      clientApi.addParameters({ framework });

      // We need to run the `executeLoadableForChanges` function *inside* the `getGlobalAnnotations
      // function in case it throws. So we also need to process its output there also
      const getGlobalAnnotations = () => {
        const { added, removed } = executeLoadableForChanges(loadable, m);

        Array.from(added.entries()).forEach(([fileName, fileExports]) =>
          clientApi.addStoriesFromExports(fileName, fileExports)
        );

        Array.from(removed.entries()).forEach(([fileName]) =>
          clientApi.clearFilenameExports(fileName)
        );

        return {
          ...clientApi.globalAnnotations,
          renderToDOM,
          applyDecorators: decorateStory,
        };
      };

      if (!preview) {
        preview = new WebPreview({
          importFn: (path: Path) => clientApi.importFn(path),
          getGlobalAnnotations,
          fetchStoriesList: async () => clientApi.getStoriesList(),
        });

        // These two bits are a bit ugly, but due to dependencies, `ClientApi` cannot have
        // direct reference to `WebPreview`, so we need to patch in bits
        clientApi.onImportFnChanged = preview.onImportFnChanged.bind(preview);
        clientApi.storyStore = preview.storyStore;

        await preview.initialize({ cacheAllCSFFiles: true });
      } else {
        getGlobalAnnotations();
        preview.onImportFnChanged({ importFn: (path: Path) => clientApi.importFn(path) });
      }
    },
  };
}
