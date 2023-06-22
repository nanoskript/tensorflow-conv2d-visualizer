import { h, render } from "https://cdn.skypack.dev/preact@10.11.2?min";
import { useEffect, useState } from "https://cdn.skypack.dev/preact@10.11.2/hooks?min";
import htm from "https://cdn.skypack.dev/htm@3.1.1?min";

// Initialize htm with Preact.
const html = htm.bind(h);

const Field = ({ children }) => {
    return html`
      <fieldset style="width: 18rem; margin-bottom: 0;">
        ${children}
      </fieldset>
    `;
};

const RangeField = ({ title, min, max, value, setValue }) => {
    return html`
      <${Field}>
        <legend>${title}: ${value}</legend>
        <input type="range" min="${min}" max="${max}" value="${value}"
               style="margin: 0; width: 100%; padding: 0;"
               oninput=${(e) => setValue(parseInt(e.target.value))}/>
      </${Field}>
    `;
};

const Parameters = ({ parameters, setParameters }) => {
    return html`
      <div>
        <h2>Parameters</h2>
        <${RangeField} title="Input size" min="${1}" max="${8}" value="${parameters.inputSize}"
                       setValue=${(value) => setParameters({ ...parameters, inputSize: value })}/>
        <${RangeField} title="Input channels" min="${1}" max="${3}" value="${parameters.inputChannels}"
                       setValue=${(value) => setParameters({ ...parameters, inputChannels: value })}/>
        <${RangeField} title="Filter size" min="${1}" max="${8}" value="${parameters.filterSize}"
                       setValue=${(value) => setParameters({ ...parameters, filterSize: value })}/>
        <${RangeField} title="Number of filters" min="${1}" max="${4}" value="${parameters.numberOfFilters}"
                       setValue=${(value) => setParameters({ ...parameters, numberOfFilters: value })}/>
        <${RangeField} title="Stride" min="${1}" max="${8}" value="${parameters.stride}"
                       setValue=${(value) => setParameters({ ...parameters, stride: value })}/>
        <${RangeField} title="Dilation" min="${1}" max="${8}" value="${parameters.dilation}"
                       setValue=${(value) => setParameters({ ...parameters, dilation: value })}/>
        <${Field}>
          <legend>Padding</legend>
          <select value=${parameters.padding} style="width: 100%"
                  onchange=${(e) => setParameters({ ...parameters, padding: e.target.value })}>
            <option value="VALID">Valid</option>
            <option value="SAME">Same</option>
          </select>
          <div style="text-align: center; font-size: smaller;">
            <a href="https://www.tensorflow.org/api_docs/python/tf/nn">How is padding calculated?</a>
          </div>
        </${Field}>
        <${Field}>
          <legend>Simulation</legend>
          <button
              style="width: 100%;"
              onClick=${(e) => {
                e.target.blur();
                setParameters({ ...parameters, paused: !parameters.paused });
              }}
          >
            ${parameters.paused ? "Resume simulation" : "Pause simulation"}
          </button>
        </${Field}>
      </div>
    `;
};

const Grid = ({ size, cells, onMouseEnter, onMouseLeave, highlight }) => {
    // Build cells.
    const cellStyles = [];
    for (let y = 0; y < size; ++y) {
        const row = [];
        for (let x = 0; x < size; ++x) {
            row.push({
                backgroundColor: "white",
                ...(cells[[x, y]] || {})
            });
        }
        cellStyles.push(row);
    }

    // Render.
    return html`
      <div style="display: flex; justify-content: center; align-items: center;">
        <table class="grid ${highlight ? "highlight" : ""}">
          ${cellStyles.map((row, y) => html`
            <tr>
              ${row.map((style, x) => html`
                <td style=${style}
                    onmouseenter=${() => onMouseEnter && onMouseEnter([x, y])}
                    onmouseleave=${() => onMouseLeave && onMouseLeave([x, y])}/>
              `)}
            </tr>
          `)}
        </table>
      </div>
    `;
};

const GridLabel = ({ children }) => {
    return html`
      <span style="font-size: x-large; font-weight: bold;">
        ${children}
      </span>
    `;
};

const ColumnLabel = ({ children }) => {
    return html`
      <div style="display: flex; justify-content: center; align-items: end;">
        <${GridLabel}>${children}</${GridLabel}>
      </div>
    `;
};

const RowLabel = ({ children }) => {
    return html`
      <div style="display: flex; justify-content: right; align-items: center;">
        <${GridLabel}>${children}</${GridLabel}>
      </div>
    `;
};

// Hash function from:
// https://stackoverflow.com/a/52171480/20776040
function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const Visualization = ({ parameters }) => {
    const [hover, setHover] = useState(null);
    const [state, setState] = useState({
        outputX: 0,
        outputY: 0,
        filter: 0,
    });

    // Calculate derived parameters.
    const dilationSpaces = (parameters.dilation - 1) * (parameters.filterSize - 1);
    const filterSpread = parameters.filterSize + dilationSpaces;

    // Calculate padding.
    let paddingStart = 0;
    let paddingEnd = 0;
    if (parameters.padding === "SAME") {
        // From TensorFlow's documentation:
        // https://www.tensorflow.org/api_docs/python/tf/nn
        let padding;
        if (parameters.inputSize % parameters.stride === 0) {
            padding = Math.max(filterSpread - parameters.stride, 0);
        } else {
            padding = Math.max(filterSpread - (parameters.inputSize % parameters.stride), 0)
        }

        paddingStart = Math.floor(padding / 2);
        paddingEnd = padding - paddingStart;
    }

    // Calculate input size.
    const inputSize = paddingStart + parameters.inputSize + paddingEnd;

    // Calculate output size.
    const outputSize = (inputSize - filterSpread + 1) / parameters.stride;
    if (outputSize <= 0) {
        return html`
          <div style="text-align: center;">
            <h2>Visualization</h2>
            <p style="font-size: x-large;">Invalid parameters</p>
          </div>
        `;
    }

    const advance = () => {
        if (state.outputX + 1 < outputSize) {
            setState({ ...state, outputX: state.outputX + 1 });
        } else if (state.outputY + 1 < outputSize) {
            setState({ ...state, outputX: 0, outputY: state.outputY + 1 });
        } else if (state.filter + 1 < parameters.numberOfFilters) {
            setState({ outputX: 0, outputY: 0, filter: state.filter + 1 });
        } else {
            setState({ outputX: 0, outputY: 0, filter: 0 });
        }
    };

    const emptyCells = (length) => {
        return Array.from({ length }, () => ({}));
    };

    // Construct empty cells.
    const inputs = emptyCells(parameters.inputChannels);
    const filters = Array(parameters.numberOfFilters).fill(null)
        .map(() => emptyCells(parameters.inputChannels));
    const outputs = emptyCells(parameters.numberOfFilters);

    const applyStyle = (cells, key, style) => {
        cells[key] = { ...cells[key], ...style };
    };

    // Apply padding color.
    for (let x = 0; x < inputSize; ++x) {
        for (let y = 0; y < inputSize; ++y) {
            if ((x < paddingStart || paddingStart + parameters.inputSize <= x) ||
                (y < paddingStart || paddingStart + parameters.inputSize <= y)) {
                for (let channel = 0; channel < parameters.inputChannels; ++channel) {
                    applyStyle(inputs[channel], [x, y], { filter: "brightness(50%)" });
                }
            }
        }
    }

    // Assign random colors to filters.
    for (let filter = 0; filter < parameters.numberOfFilters; ++filter) {
        for (let channel = 0; channel < parameters.inputChannels; ++channel) {
            const hash = cyrb53(JSON.stringify({ filter, channel }));
            const backgroundColor = `hsl(${hash % 360}, 100%, 40%)`;
            for (let x = 0; x < parameters.filterSize; ++x) {
                for (let y = 0; y < parameters.filterSize; ++y) {
                    applyStyle(filters[filter][channel], [x, y], { backgroundColor });
                }
            }
        }
    }

    const overlayState = (state) => {
        // Apply cell styles.
        outputs[state.filter][[state.outputX, state.outputY]] = { backgroundColor: "black" };

        const inputX = state.outputX * parameters.stride;
        const inputY = state.outputY * parameters.stride;
        for (let channel = 0; channel < parameters.inputChannels; ++channel) {
            for (let offsetX = 0; offsetX < parameters.filterSize; ++offsetX) {
                for (let offsetY = 0; offsetY < parameters.filterSize; ++offsetY) {
                    const x = inputX + parameters.dilation * offsetX;
                    const y = inputY + parameters.dilation * offsetY;
                    const filterCell = filters[state.filter][channel][[offsetX, offsetY]];
                    applyStyle(inputs[channel], [x, y], { ...filterCell });
                }
            }
        }
    };

    overlayState(hover || state);
    const pause = parameters.paused || hover;
    if (!pause) {
        useEffect(() => {
            const interval = setInterval(() => advance(), 1000);
            return () => clearInterval(interval);
        }, [state]);
    }

    return html`
      <div>
        <h2 style="text-align: center;">Visualization</h2>
        <div style=${{
          display: "grid",
          gridTemplateColumns: `repeat(${1 + parameters.inputChannels}, max-content)`,
          gap: "2rem",
          margin: "2rem",
          justifyContent: "center",
        }}>
          <div/>
          ${Array(parameters.inputChannels).fill(null).map((_, index) => html`
            <${ColumnLabel}>Channel ${index + 1}</${ColumnLabel}>
          `)}
          <${RowLabel}>Input</${RowLabel}>
          ${inputs.map((cells) => html`
            <${Grid} size="${inputSize}" cells="${cells}" highlight=${!!hover}/>
          `)}
          ${filters.map((channels, index) => html`
            <${RowLabel}>Filter ${index + 1}</${RowLabel}>
            ${channels.map((cells) => html`
              <${Grid} size="${parameters.filterSize}" cells="${cells}"
                       highlight=${hover && hover.filter === index}/>
            `)}
          `)}
        </div>
        <hr style="margin: 2rem auto;"/>
        <div style="display: flex; flex-direction: row; gap: 2rem; justify-content: center;">
          ${outputs.map((cells, index) => html`
            <div style="display: flex; flex-direction: column; gap: 2rem;">
              <${ColumnLabel}>Output ${index + 1}</${ColumnLabel}>
              <${Grid} size="${outputSize}" cells="${cells}"
                       highlight=${hover && hover.filter === index}
                       onMouseEnter=${([x, y]) => setHover({ outputX: x, outputY: y, filter: index })}
                       onMouseLeave=${() => setHover(null)}/>
            </div>
          `)}
        </div>
      </div>
    `;
};

const Python = ({ parameters }) => {
    const {
        inputSize,
        inputChannels,
        filterSize,
        numberOfFilters,
        stride,
        padding,
        dilation
    } = parameters;

    return html`
      <div>
        <h2>Python</h2>
        <pre>
          <code>
import tensorflow as tf
import numpy as np
            
<b>
${[
  ``,
  ``,
  `input_size = ${inputSize}`,
  `input_channels = ${inputChannels}`,
  `filter_size = ${filterSize}`,
  `number_of_filters = ${numberOfFilters}`,
  `stride = ${stride}`,
  `padding = "${padding}"`,
  `dilation = ${dilation}`,
  ``,
  ``,
].join("\n")}
</b>
            
def tensor_of_shape(shape):
    return np.random.rand(*shape)
            
output = tf.nn.conv2d(
    tensor_of_shape([1, input_size, input_size, input_channels]), 
    filters=tensor_of_shape([filter_size, filter_size, input_channels, number_of_filters]), 
    strides=[stride, stride],
    padding=padding,
    dilations=[dilation, dilation],
)
            
print(output)
          </code>
        </pre>
      </div>
    `;
};

function Page() {
    const [parameters, setParameters] = useState({
        inputSize: 4,
        inputChannels: 1,
        filterSize: 2,
        numberOfFilters: 1,
        stride: 1,
        dilation: 1,
        padding: "VALID",
        paused: false,
    });

    return html`
      <div style="margin: 2rem;">
        <div style="display: flex; flex-direction: row; gap: 4rem;">
          <div style="flex: 1; display: flex; justify-content: left;">
            <${Parameters} parameters=${parameters} setParameters=${setParameters}/>
          </div>
          <div style="flex: 1;">
            <${Visualization} parameters=${parameters}/>
          </div>
          <div style="flex: 1;"/>
        </div>
        <${Python} parameters=${parameters}/>
      </div>
    `;
}

render(html`<${Page}/>`, document.querySelector("main"));
