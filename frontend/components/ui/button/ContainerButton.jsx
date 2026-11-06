const ContainerButton = ({ title, children, onClick, type = "submit", loading = false, disabled, className = "" }) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full cursor-pointer rounded-md bg-purple-600 py-3 text-lg font-semibold text-white transition ease-in-out hover:bg-purple-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {loading ? "Please wait..." : (children ?? title)}
    </button>
  );
};

export default ContainerButton;
