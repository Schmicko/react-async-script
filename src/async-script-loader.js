import React, { PropTypes } from "react";

const SCRIPT_MAP = new Map();

// A counter used to generate a unique id for each component that uses the function
let idCount = 0;

function getDisplayName(WrappedComponent) {
    return WrappedComponent.displayName || WrappedComponent.name || "Component";
}

export default function makeAsyncScript({scriptURL, globalName, callbackName, exposeFuncs}) {
    if (!scriptURL) {
        throw new Error("makeAsyncScript requries a scriptURL");
    }

    return function wrapWithAsyncScript(WrappedComponent) {
        class AsyncScriptLoader extends React.Component {
            static displayName = `AsyncScriptLoader(${getDisplayName(WrappedComponent)})`;

            static propTypes = {
                asyncScriptOnLoad: PropTypes.func,
            }

            constructor(props) {
                super(props);
                this.asyncScriptLoaderHandleLoad = this.asyncScriptLoaderHandleLoad.bind(this);
            }

            componentDidMount() {
                const key = this.asyncScriptLoaderGetScriptLoaderID();

                if (globalName && typeof window[globalName] !== "undefined") {
                    SCRIPT_MAP.set(scriptURL, { loaded: true, observers: new Map() });
                }

                if (SCRIPT_MAP.has(scriptURL)) {
                    const entry = SCRIPT_MAP.get(scriptURL);
                    if (entry.loaded || entry.errored) {
                        this.asyncScriptLoaderHandleLoad(entry);
                        return;
                    }
                    entry.observers.set(key, this.asyncScriptLoaderHandleLoad);
                    return;
                }

                const observers = new Map();
                observers.set(key, this.asyncScriptLoaderHandleLoad);
                SCRIPT_MAP.set(scriptURL, {
                    loaded: false,
                    observers: observers,
                });

                const script = document.createElement("script");

                script.src = scriptURL;
                script.async = 1;

                const callObserverFuncAndRemoveObserver = (func) => {
                    if (SCRIPT_MAP.has(scriptURL)) {
                        const mapEntry = SCRIPT_MAP.get(scriptURL);
                        const observersMap = mapEntry.observers;

                        for (const [obsKey, observer] of observersMap) {
                            if (func(observer)) {
                                observersMap.delete(obsKey);
                            }
                        }
                    }

                    // Remove the global callback if it exists.
                    if (callbackName && typeof window !== "undefined") {
                        delete window[callbackName];
                    }
                };

                const scriptOnLoad = () => {
                    const mapEntry = SCRIPT_MAP.get(scriptURL);
                    mapEntry.loaded = true;
                    callObserverFuncAndRemoveObserver( (observer) => {
                        observer(mapEntry);
                        return true;
                    });
                };

                if (callbackName && typeof window !== "undefined") {
                    // If user has provided a callbackName, allow the script being loaded
                    // to trigger the callback.
                    window[callbackName] = scriptOnLoad;
                } else {
                    // Otherwise listen fot the scripts onLoad event.
                    script.onload = scriptOnLoad;
                }

                script.onerror = () => {
                    const mapEntry = SCRIPT_MAP.get(scriptURL);
                    mapEntry.errored = true;
                    callObserverFuncAndRemoveObserver( (observer) => {
                        observer(mapEntry);
                        return true;
                    });
                };

                // (old) MSIE browsers may call "onreadystatechange" instead of "onload"
                script.onreadystatechange = () => {
                    if (this.readyState === "loaded") {
                        // wait for other events, then call onload if default onload hadn"t been called
                        window.setTimeout(() => {
                            if (SCRIPT_MAP.get(scriptURL).loaded !== true) {
                                script.onload();
                            }
                        }, 0);
                    }
                };

                document.body.appendChild(script);
            }

            componentWillUnmount() {
                // Clean the observer entry
                const mapEntry = SCRIPT_MAP.get(scriptURL);
                if (mapEntry) {
                    mapEntry.observers.delete(this.asyncScriptLoaderGetScriptLoaderID());
                }
            }

            getComponent() {
                return this.childComponent;
            }

            asyncScriptLoaderGetScriptLoaderID() {
                if (!this.__scriptLoaderID) {
                    this.__scriptLoaderID = "async-script-loader-" + idCount++;
                }
                return this.__scriptLoaderID;
            }

            asyncScriptLoaderHandleLoad(state) {
                this.setState(state, this.props.asyncScriptOnLoad);
            }

            render() {
                const { asyncScriptOnLoad, ...childProps } = this.props;
                if (globalName && typeof window !== "undefined") {
                    childProps[globalName] = typeof window[globalName] !== "undefined" ? window[globalName] : undefined;
                }
                return <WrappedComponent ref={(comp) => {this.childComponent = comp; }} {...childProps} />;
            }
        }

        // Map functions to expose to the AsyncScriptLoader class
        if (exposeFuncs) {
            for (const funcToExpose of exposeFuncs) {
                /* eslint-disable no-loop-func */
                AsyncScriptLoader[funcToExpose] = function exposedFunc() {
                    return this.childComponent[funcToExpose](...arguments);
                };
                /* eslint-enable no-loop-func */
            }
        }

        return AsyncScriptLoader;
    };
}
